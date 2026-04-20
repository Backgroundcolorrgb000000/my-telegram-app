const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. НАСТРОЙКИ
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

if (!token) {
    console.error("ОШИБКА: Токен бота не найден в переменных Railway!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ
async function saveOrderToSheets(rowData) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow(rowData);
        console.log("✅ Данные успешно добавлены в таблицу");
    } catch (e) {
        console.error("❌ Ошибка записи в таблицу:", e.message);
    }
}

// 3. ПРИЕМ ДАННЫХ (Исправление для [Function: text])
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const raw = ctx.webAppData.data;

        // Если данные пришли как объект с функциями (как в вашем логе)
        if (raw && typeof raw.text === 'function') {
            const text = await raw.text();
            data = JSON.parse(text);
        } else if (typeof raw === 'string') {
            data = JSON.parse(raw);
        } else {
            data = raw;
        }

        console.log("Данные из Mini App:", data);

        const amount = Math.round(data.totalPrice || 0);
        if (amount <= 0) return ctx.reply("Корзина пуста.");

        await ctx.reply(`✅ Заказ на ${amount.toLocaleString()} сум принят.`);

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: JSON.stringify({ items: data.products || {} }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }],
            start_parameter: 'order'
        });

    } catch (e) {
        console.error("Ошибка парсинга WebApp:", e.message);
        ctx.reply("Ошибка при чтении данных корзины.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 4. ПОСЛЕ ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Приложение",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": JSON.stringify(payload.items),
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("✨ Спасибо за покупку! Данные в таблице.");
    } catch (e) {
        console.error("Ошибка успешной оплаты:", e.message);
    }
});

// Запуск
bot.launch()
    .then(() => console.log('🚀 Бот успешно запущен на Railway'))
    .catch((err) => console.error('❌ Ошибка запуска:', err));

// Защита от зависаний (SIGTERM)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
