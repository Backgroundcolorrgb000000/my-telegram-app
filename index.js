const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. НАСТРОЙКИ
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
// ВСТАВЬТЕ ВАШУ ССЫЛКУ НИЖЕ
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN не найден в Railway!");
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
        console.log("✅ Данные в таблице!");
    } catch (e) {
        console.error("❌ Ошибка записи:", e.message);
    }
}

// 3. КОМАНДА СТАРТ (ОТРИСОВКА КНОПКИ)
bot.start((ctx) => {
    ctx.reply('Добро пожаловать в FORMA! Нажмите на кнопку ниже, чтобы заказать мебель.', 
        Markup.keyboard([
            [Markup.button.webApp('🛒 Открыть каталог', webAppUrl)]
        ]).resize()
    );
});


// 4. ПРИЕМ ДАННЫХ ИЗ КАТАЛОГА
bot.on('web_app_data', async (ctx) => {
    try {
        let data = JSON.parse(ctx.webAppData.data);
        const amount = Math.round(data.totalPrice || 0);

        if (amount <= 0) return ctx.reply('Корзина пуста.');

        // Выставляем счет через CLICK
        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Заказ через CLICK',
            payload: JSON.stringify({ order_items: data.products || {} }),
            provider_token: PAYMENT_TOKEN, // Ваш новый токен CLICK
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }],
            start_parameter: 'click-order',
            // Дополнительные данные, которые любит CLICK:
            need_phone_number: true, 
            send_phone_number_to_provider: true 
        });
    } catch (e) {
        console.error("Ошибка CLICK Invoice:", e.message);
    }
});

// ОБЯЗАТЕЛЬНОЕ подтверждение (обработчик тот же)
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 5. ПОСЛЕ ОПЛАТЫ (Блок записи в таблицу остается без изменений)
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const itemsStr = Object.entries(payload.order_items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Заказ через CLICK",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsStr,
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🎉 Оплата через CLICK принята! Данные уже в таблице.");
    } catch (e) {
        console.error("Ошибка записи CLICK:", e.message);
    }
});
// ... (запуск бота)
bot.launch().then(() => console.log('🚀 Бот запущен с НОВЫМ токеном!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));