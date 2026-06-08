const { WebSocketServer, WebSocket } = require('ws');

// Тот самый порт, но на Render он будет автоматически переназначен хостингом через process.env.PORT
const PORT = process.env.PORT || 8081;
const wss = new WebSocketServer({ port: PORT });

// Метод дешифрования/шифрования (XOR 0x15), как в твоем чите
function cypher(input) {
    const buffer = Buffer.from(input, 'utf8');
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= 0x15;
    }
    return buffer.toString('utf8');
}

// Хранилище префиксов пользователей (в оперативной памяти)
const userPrefixes = new Map(); 

console.log(`IRC WebSocket сервер запущен на порту ${PORT}`);

wss.on('connection', (ws, req) => {
    // Получаем clientId из заголовка, как в твоем Java коде
    const clientId = req.headers['sec-websocket-key'];
    console.log(`Новое подключение. ClientId: ${clientId}`);

    ws.on('message', (rawData) => {
        try {
            // 1. Дешифруем входящее сообщение
            const decrypted = cypher(rawData.toString());
            const json = JSON.parse(decrypted);
            
            if (!json.type) return;

            // 2. Обработка отправки сообщения в чат
            if (json.type === 'text') {
                const author = json.author || "Unknown";
                const message = json.message || "";
                const currentClientId = json.clientId || clientId;
                
                // Получаем префикс игрока (если нет — по дефолту "rich")
                const prefix = userPrefixes.get(currentClientId) || "rich";

                // Формируем пакет для рассылки всем
                const response = {
                    type: 'text',
                    author: author,
                    message: message,
                    prefix: prefix
                };

                // Отправляем всем подключенным клиентам
                broadcast(response);
            }

            // 3. Обработка запроса текущего префикса
            if (json.type === 'get_prefix') {
                const currentClientId = json.clientId || clientId;
                const prefix = userPrefixes.get(currentClientId) || "rich";
                
                ws.send(cypher(JSON.stringify({
                    type: 'prefix_info',
                    prefix: prefix
                })));
            }

            // 4. Обработка установки нового префикса
            if (json.type === 'set_prefix') {
                const currentClientId = json.clientId || clientId;
                const newPrefix = json.new_prefix || "rich";
                
                userPrefixes.set(currentClientId, newPrefix);
                
                ws.send(cypher(JSON.stringify({
                    type: 'prefix_updated',
                    prefix: newPrefix
                })));
            }

        } catch (e) {
            console.error("Ошибка обработки сообщения:", e.message);
        }
    });

    ws.on('close', () => {
        console.log(`Клиент отключился`);
    });
});

// Функция отправки сообщения вообще всем игрокам на сервере
function broadcast(data) {
    const encryptedData = cypher(JSON.stringify(data));
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(encryptedData);
        }
    });
}