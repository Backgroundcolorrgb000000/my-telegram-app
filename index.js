const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http'); // Добавляем для Health Check

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

// 1. СОЗДАЕМ ПРОСТОЙ СЕРВЕР ДЛЯ RAILWAY (чтобы не было SIGTERM)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive');
}).listen(port);

const bot = new Telegraf(token);

// Функция записи в таблицу
async function saveOrderToSheets(rowData) {
    try {
        if (!process.env.GOOGLE_PRIVATE_KEY) throw new Error("Нет приватного ключа Google");
        
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        await doc.sheetsByIndex[0].addRow(rowData);
        console.log("✅ Данные записаны в таблицу");
    } catch (e) {
        console.error("❌ Ошибка таблицы:", e.message);
    }
}

bot.start((ctx) => {
    ctx.reply('Магазин мебели FORMA готов к работе!', 
        Markup.keyboard([[Markup.button.webApp('🛒 Открыть каталог', webAppUrl)]]).resize()
    );
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.json()); // Telegraf сам умеет парсить json из webapp
        
        // ВНИМАНИЕ: Проверь, чтобы в index.html ты отправлял totalPrice
        const amount = Math.round(data.totalPrice || 0); 
        
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста или сумма неверна.');

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: JSON.stringify({ items: data.products }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }], // В копейках/тийинах
            start_parameter: 'order-process'
        });
        
    } catch (e) {
        console.error("❌ ОШИБКА ИНВОЙСА:", e.message);
        ctx.reply("Произошла ошибка при формировании счета.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const itemsStr = Object.entries(payload.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Заказ из каталога",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsStr || "Товары",
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("✨ Оплата прошла успешно! Мы скоро свяжемся с вами.");

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${ctx.from.first_name}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Сумма:</b> ${(payment.total_amount / 100).toLocaleString()} сум`;
            
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'HTML' });
            console.log("✅ Уведомление админу отправлено");
        }
    } catch (e) {
        console.error("❌ ОШИБКА ПОСЛЕ ОПЛАТЫ:", e.message);
    }
});

// Запуск бота с обработкой ошибок
bot.launch()
    .then(() => console.log('🚀 Бот успешно запущен и Health-check активен!'))
    .catch((err) => console.error('❌ Критическая ошибка старта:', err));

// Плавная остановка (обязательно для Railway)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));