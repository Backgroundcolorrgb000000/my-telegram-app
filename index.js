const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. ПЕРЕМЕННЫЕ
const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

if (!token) {
    console.error("ОШИБКА: BOT_TOKEN отсутствует в Railway Variables!");
    process.exit(1);
}

const bot = new Telegraf(token);

// 2. ФУНКЦИЯ ЗАПИСИ
async function saveOrderToSheets(rowData) {
    try {
        if (!process.env.GOOGLE_PRIVATE_KEY) {
            throw new Error("GOOGLE_PRIVATE_KEY не найден в переменных окружения");
        }

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

// 3. ОБРАБОТКА ДАННЫХ ИЗ MINI APP
bot.on('web_app_data', async (ctx) => {
    try {
        let data;
        // Безопасный парсинг данных
        try {
            data = typeof ctx.webAppData.data === 'string' 
                ? JSON.parse(ctx.webAppData.data) 
                : JSON.parse(ctx.webAppData.data.text());
        } catch (parseError) {
            data = ctx.webAppData.data;
        }

        console.log("Данные заказа получены:", data);

        const totalAmount = Math.round(data.totalPrice || 0);
        if (totalAmount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        await ctx.reply(`✅ Заказ на ${totalAmount.toLocaleString()} сум принят. Формирую счет...`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели FORMA',
            description: 'Ваш заказ из каталога',
            payload: JSON.stringify({
                userId: ctx.from.id,
                items: data.products || data.order // пробуем оба варианта ключей
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });

    } catch (e) {
        console.error("Ошибка инвойса:", e.message);
        ctx.reply("Произошла ошибка при создании счета.");
    }
});

// 4. ПРОВЕРКА ПЕРЕД ОПЛАТОЙ (ОБЯЗАТЕЛЬНО)
bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

// 5. ПОСЛЕ УСПЕШНОЙ ОПЛАТЫ
bot.on('successful_payment', async (ctx) => {
    console.log("=== ОБНАРУЖЕН ПЛАТЕЖ ===");
    
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        
        // Формируем список товаров
        let itemsString = "Мебель: ";
        if (orderInfo.items) {
            itemsString = Object.entries(orderInfo.items)
                .map(([id, qty]) => `${id} (${qty}шт)`)
                .join(', ');
        }

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name || "Клиент",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsString,
            "ID пользователя": String(ctx.from.id)
        };

        console.log("Попытка записи в таблицу:", rowData);

        await saveOrderToSheets(rowData);
        
        console.log("✅ ЗАПИСЬ В ТАБЛИЦУ ВЫПОЛНЕНА");
        await ctx.reply("🎉 Спасибо! Оплата прошла, данные сохранены в Google Таблицу.");

    } catch (error) {
        console.error("❌ ОШИБКА ПРИ ЗАПИСИ ЗАКАЗА:", error.message);
    }
});

// Запуск
bot.launch().then(() => console.log('🚀 Бот запущен! Оплата и Таблицы активны.'));

// Мягкая остановка (защита от ошибки 409 Conflict)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));