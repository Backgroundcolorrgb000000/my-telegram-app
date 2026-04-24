const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; // НОВОЕ: Переменная для вашего ID
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
        
        let data;
        const raw = ctx.webAppData.data;

        if (raw && typeof raw.text === 'function') {
            const textData = await raw.text();
            data = JSON.parse(textData);
        } else if (typeof raw === 'string') {
            data = JSON.parse(raw);
        } else {
            data = raw;
        }

        console.log("✅ Распознанные данные:", data);
        
        const amount = Math.round(data.totalPrice || 0);
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        console.log(`💳 Выставляю счет на ${amount} UZS...`);

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: JSON.stringify({ items: data.products }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: amount * 100 }],
            start_parameter: 'order-smart-glocal'
        });
        
    } catch (e) {
        console.error("❌ ОШИБКА:", e.message);
        ctx.reply("Ошибка при обработке заказа. Мы уже чиним её!");
    }
});

// ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА
bot.on('pre_checkout_query', (ctx) => {
    console.log("💎 Обработка pre_checkout_query...");
    ctx.answerPreCheckoutQuery(true);
});

// УСПЕШНАЯ ОПЛАТА И УВЕДОМЛЕНИЯ
bot.on('successful_payment', async (ctx) => {
    try {
        const payload = JSON.parse(ctx.message.successful_payment.invoice_payload);
        
        const itemsStr = Object.entries(payload.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": ctx.from.first_name,
            "Адрес": "Заказ из каталога",
            "Сумма (сум)": ctx.message.successful_payment.total_amount / 100,
            "Товары": itemsStr || "Мебель",
            "ID пользователя": String(ctx.from.id)
        };

        // 1. Запись в таблицу
        await saveOrderToSheets(rowData);
        
        // 2. Сообщение клиенту
        await ctx.reply("✨ УРА! Оплата прошла успешно. Мы уже начали собирать ваш заказ!");

        // 3. НОВОЕ: Уведомление администратору (Вам)
        if (ADMIN_ID) {
            const username = ctx.from.username ? `(@${ctx.from.username})` : '';
            // Используем HTML теги <b> вместо звездочек
            const adminMessage = `
💰 <b>НОВЫЙ ЗАКАЗ ОПЛАЧЕН!</b>
👤 <b>Клиент:</b> ${ctx.from.first_name} ${username}
📦 <b>Товары:</b> ${itemsStr}
💵 <b>Сумма:</b> ${(ctx.message.successful_payment.total_amount / 100).toLocaleString('ru-RU')} сум
📅 <b>Дата:</b> ${rowData["Дата"]}
            `;
            // Меняем parse_mode на 'HTML'
            await bot.telegram.sendMessage(ADMIN_ID, adminMessage, { parse_mode: 'HTML' });
            console.log("✅ Уведомление админу отправлено");
        }

    } catch (e) {
        console.error("Ошибка после оплаты:", e.message);
    }
});

bot.launch().then(() => console.log('🚀 Бот успешно запущен и готов к работе!'));