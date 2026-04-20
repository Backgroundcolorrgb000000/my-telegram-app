const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. НАСТРОЙКИ
const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN отсутствует в Railway!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ (ОБЯЗАТЕЛЬНО ДОЛЖНА БЫТЬ ЗДЕСЬ)
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
        console.log("✅ Данные успешно отправлены в Google Sheets");
    } catch (e) {
        console.error("❌ Ошибка внутри функции saveOrderToSheets:", e.message);
        throw e;
    }
}

// 3. ПРИЕМ ДАННЫХ ИЗ КАТАЛОГА (Исправление ошибки "корзина пуста")
bot.on('web_app_data', async (ctx) => {
    try {
        console.log("Сырые данные из WebApp:", ctx.webAppData.data);
        
        let data;
        // Универсальный парсинг: строка или объект
        try {
            data = typeof ctx.webAppData.data === 'string' 
                ? JSON.parse(ctx.webAppData.data) 
                : ctx.webAppData.data;
        } catch (e) {
            // Если Telegram обернул данные в дополнительный объект .text()
            data = JSON.parse(ctx.webAppData.data.text());
        }

        console.log("Распакованные данные:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        
        if (totalAmount <= 0) {
            return ctx.reply('Ошибка: сумма заказа не определена.');
        }

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят. Формирую счет...`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ из каталога',
            payload: JSON.stringify({
                userId: ctx.from.id,
                items: data.products || {}
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });

    } catch (e) {
        console.error("Ошибка при получении данных заказа:", e.message);
        ctx.reply("Произошла ошибка при обработке заказа.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 4. ОБРАБОТКА ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    console.log("=== ОБНАРУЖЕН ПЛАТЕЖ ===");
    
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        
        const items = orderInfo.items || {};
        const itemsString = Object.entries(items)
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        // СТРОГО под вашу таблицу на Screenshot_14
        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Адрес": "Из приложения", // Колонка C на Screenshot_14
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsString || "Мебель",
            "ID пользователя": String(ctx.from.id)
        };

        console.log("Попытка записи в таблицу:", rowData);

        await saveOrderToSheets(rowData);
        
        console.log("✅ ЗАПИСЬ В ТАБЛИЦУ ВЫПОЛНЕНА");
        await ctx.reply("🎉 Оплата прошла! Данные сохранены в таблицу.");

    } catch (error) {
        console.error("❌ ОШИБКА ПРИ ЗАПИСИ ЗАКАЗА:", error.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот запущен!'));