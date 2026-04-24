const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const token = process.env.BOT_TOKEN;
// Сюда в Railway Variables вставьте ваш новый CLICK Terminal Test токен
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN || 'ВАШ_НОВЫЙ_ТОКЕН_CLICK'; 
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

const bot = new Telegraf(token);

async function saveOrderToSheets(rowData) {
    try {
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

// ПРИЕМ ДАННЫХ
bot.on('web_app_data', async (ctx) => {
    try {
        console.log("📥 Получены сырые данные:", ctx.webAppData.data);
        const data = JSON.parse(ctx.webAppData.data);
        
        const amount = Math.round(data.totalPrice || 0);
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста или цена не передана.');

        console.log(`💳 Попытка выставить счет на ${amount} UZS через CLICK...`);

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа из каталога',
            payload: JSON.stringify({ order_items: data.products }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }],
            start_parameter: 'mebel-order',
            need_phone_number: true, // Полезно для CLICK
            send_phone_number_to_provider: true
        });
        
        console.log("🚀 Счет успешно отправлен в чат!");
    } catch (e) {
        console.error("❌ ОШИБКА ОТПРАВКИ СЧЕТА:", e.message);
        ctx.reply("Ошибка при формировании счета. Проверьте логи сервера.");
    }
});

// ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА (Важно для Click)
bot.on('pre_checkout_query', (ctx) => {
    console.log("💎 Обработка pre_checkout_query...");
    ctx.answerPreCheckoutQuery(true);
});

// УСПЕШНАЯ ОПЛАТА
bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const itemsStr = Object.entries(payload.order_items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name,
            "Адрес": "Заказ CLICK",
            "Сумма (сум)": payment.total_amount / 100,
            "Товары": itemsStr,
            "ID пользователя": String(ctx.from.id)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("🎉 Оплата прошла успешно! Спасибо за заказ.");
    } catch (e) {
        console.error("❌ Ошибка после оплаты:", e.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот работает на новом токене CLICK!'));