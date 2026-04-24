const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. НАСТРОЙКИ (Проверьте эти переменные в Railway!)
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
const WEB_APP_URL = 'ВАША_ССЫЛКА_НА_APP'; // Вставьте сюда ссылку на ваш каталог

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ (Исправляет ошибку со Screenshot_11)
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
        console.log("✅ Данные записаны в Google Таблицу");
    } catch (e) {
        console.error("❌ Ошибка Google Sheets:", e.message);
    }
}

// 3. КОМАНДА СТАРТ (ВОЗВРАЩАЕТ КНОПКУ)
bot.start((ctx) => {
    ctx.reply('Добро пожаловать в магазин мебели FORMA! Нажмите кнопку ниже, чтобы открыть каталог.', 
        Markup.keyboard([
            [Markup.button.webApp('🛒 Открыть каталог', WEB_APP_URL)]
        ]).resize()
    );
});

// 4. ПРИЕМ ДАННЫХ ИЗ КАТАЛОГА
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        const raw = ctx.webAppData.data;

        // Исправляем [Функция: text] со Screenshot_8
        if (raw && typeof raw.text === 'function') {
            data = JSON.parse(await raw.text());
        } else {
            data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }

        console.log("Данные заказа:", data);
        const amount = Math.round(data.totalPrice || 0);

        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ из каталога',
            payload: JSON.stringify({ items: data.products || {} }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }],
            start_parameter: 'mebel-order'
        });
    } catch (e) {
        console.error("Ошибка счета:", e.message);
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 5. УСПЕШНАЯ ОПЛАТА
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const itemsString = Object.entries(payload.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        // СТРОГО под вашу таблицу на Screenshot_14
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Заказ из приложения", // Колонка C
            "Сумма (сум)": payment.total_amount / 100, // Колонка D
            "Товары": itemsString || "Мебель", // Колонка E
            "ID пользователя": String(ctx.from.id) // Колонка F
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🎉 Оплата прошла! Мы скоро свяжемся с вами.");
    } catch (error) {
        console.error("❌ ОШИБКА ПОСЛЕ ОПЛАТЫ:", error.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот успешно запущен!'));