const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Переменные окружения
const token = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID || 1296940843;
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

const bot = new Telegraf(token);

// Настройка Google Sheets
async function saveOrderToSheets(orderData) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0]; // Берем первый лист

        await sheet.addRow({
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": orderData.name,
            "Адрес": orderData.address,
            "Сумма (сум)": orderData.amount,
            "Товары": orderData.items,
            "ID пользователя": orderData.userId
        });
        console.log("Заказ успешно записан в таблицу");
    } catch (e) {
        console.error("Ошибка записи в таблицу:", e);
    }
}

bot.start((ctx) => {
    ctx.reply('Магазин мебели в Ташкенте открыт!', {
        reply_markup: {
            keyboard: [[{ text: "🛒 Открыть каталог", web_app: { url: webAppUrl } }]],
            resize_keyboard: true
        }
    });
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.text());
        const totalAmount = Math.round(data.totalPrice);

        await ctx.reply(`✅ Заказ принят на сумму ${totalAmount} сум. Формирую чек...`);

        await ctx.replyWithInvoice({
            title: 'Оплата мебели',
            description: 'Заказ в магазине Mebel Shop',
            payload: JSON.stringify({
                name: data.customerName,
                address: data.customerAddress,
                items: data.products,
                userId: ctx.from.id 
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });
    } catch (e) {
        console.error("Ошибка счета:", e);
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => { 
    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);

        let itemsList = '';
        for (const [name, count] of Object.entries(orderInfo.items)) {
            if (count > 0) itemsList += `${name} (${count}шт); `;
        }

        // 1. Сохраняем в таблицу
        await saveOrderToSheets({
            name: orderInfo.name,
            address: orderInfo.address,
            amount: payment.total_amount / 100,
            items: itemsList,
            userId: orderInfo.userId
        });

        await ctx.reply('✅ Оплата получена! Информация о заказе сохранена.');

        // 2. Уведомление АДМИНУ
        await bot.telegram.sendMessage(ADMIN_ID, `🚀 **НОВЫЙ ЗАКАЗ!** (Записан в таблицу)\n\n👤 ${orderInfo.name}\n📍 ${orderInfo.address}\n💰 ${payment.total_amount / 100} сум\n🛒 Товары:\n${itemsList.replace(/; /g, '\n')}`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛠 В сборку', callback_data: `st_build_${orderInfo.userId}` }],
                    [{ text: '🚚 Курьеру', callback_data: `st_ship_${orderInfo.userId}` }],
                    [{ text: '✅ Завершить', callback_data: `st_done_${orderInfo.userId}` }]
                ]
            }
        });
    } catch (e) {
        console.error("Ошибка в обработке платежа:", e);
    }
});

bot.on('callback_query', async (ctx) => {
    const [prefix, action, targetId] = ctx.callbackQuery.data.split('_');
    if (prefix !== 'st') return;

    let text = '';
    if (action === 'build') text = '🛠 Ваш заказ передан на сборку!';
    if (action === 'ship') text = '🚚 Ваша мебель уже в пути с курьером!';
    if (action === 'done') text = '✅ Заказ доставлен! Спасибо за покупку.';

    try {
        await bot.telegram.sendMessage(targetId, text);
        await ctx.answerCbQuery('Статус изменен');
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n📢 **Статус:** ${text}`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Ошибка статуса:", e);
    }
});

bot.launch().then(() => console.log('Бот запущен с поддержкой Google Sheets!'));