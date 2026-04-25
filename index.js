const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 

const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/?v=7';

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port);

const bot = new Telegraf(token);

// 🛠️ НОВОЕ: Временное хранилище для заказов (чтобы обойти лимит Telegram в 128 байт)
const pendingOrders = new Map();

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
        console.log("✅ Запись в Google Sheets");
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
        const data = JSON.parse(ctx.message.web_app_data.data);
        const amount = Math.round(data.totalPrice || 0); 
        
        if (amount <= 0) return ctx.reply('Ошибка: корзина пуста.');

        // 1. Создаем короткий уникальный ID заказа
        const orderId = `order_${Date.now()}`;

        // 2. Сохраняем все "тяжелые" данные в память бота
        pendingOrders.set(orderId, {
            items: data.products,
            cName: data.customerName,
            cPhone: data.customerPhone,
            cAddress: data.deliveryAddress,
            cDelivery: data.deliveryMethod
        });

        // 3. Отправляем инвойс только с коротким ID (он точно меньше 128 символов!)
        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: orderId, // <-- Вот наше исправление
            provider_token: PAYMENT_TOKEN,
            currency: 'USD',
            prices: [{ label: 'Итого к оплате', amount: amount * 100 }], 
            start_parameter: 'order-process'
        });
        
    } catch (e) {
        console.error("❌ ОШИБКА ИНВОЙСА:", e.message);
        ctx.reply("Ошибка при создании счета. Попробуйте еще раз.");
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => {
    try {
        const payment = ctx.message.successful_payment;
        const orderId = payment.invoice_payload; // Получаем наш короткий ID
        const userId = ctx.from.id;
        
        // Достаем данные из памяти бота
        const orderData = pendingOrders.get(orderId) || {};
        
        const itemsStr = Object.entries(orderData.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const cName = orderData.cName || ctx.from.first_name;
        const cPhone = orderData.cPhone || "Не указан";
        const cDelivery = orderData.cDelivery || "Не указана";
        const cAddress = orderData.cAddress || "Не указан";

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": `${cName} (${cPhone})`,
            "Адрес": `${cDelivery} - ${cAddress}`,
            "Сумма ($)": payment.total_amount / 100,
            "Товары": itemsStr || "Товары",
            "ID пользователя": String(userId)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("✨ Оплата прошла успешно! Ожидайте подтверждения.");

        // Удаляем заказ из временной памяти, чтобы не засорять сервер
        pendingOrders.delete(orderId);

        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${cName}\n` +
                             `📞 <b>Телефон:</b> ${cPhone}\n` +
                             `🚚 <b>Тип доставки:</b> ${cDelivery}\n` +
                             `📍 <b>Адрес:</b> ${cAddress}\n` +
                             `📦 <b>Товары:</b> ${itemsStr}\n` +
                             `💵 <b>Итого:</b> $ ${payment.total_amount / 100}`;
            
            await bot.telegram.sendMessage(ADMIN_ID, adminMsg, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('✅ Принять', `accept_${userId}`),
                        Markup.button.callback('❌ Отклонить', `reject_${userId}`)
                    ]
                ])
            });
        }
    } catch (e) {
        console.error("❌ ОШИБКА ПОСЛЕ ОПЛАТЫ:", e.message);
    }
});

bot.action(/accept_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    try {
        await bot.telegram.sendMessage(userId, "✅ <b>Ваш заказ принят в работу!</b>\nНаш менеджер скоро свяжется с вами для уточнения деталей.", { parse_mode: 'HTML' });
        await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🟢 <b>СТАТУС: ПРИНЯТ</b>", { parse_mode: 'HTML' });
        await ctx.answerCbQuery("Заказ принят!");
    } catch (e) {
        await ctx.answerCbQuery("Ошибка: не удалось отправить сообщение клиенту.");
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    try {
        await bot.telegram.sendMessage(userId, "❌ <b>К сожалению, ваш заказ отменен.</b>\nЕсли у вас есть вопросы, пожалуйста, напишите в поддержку.", { parse_mode: 'HTML' });
        await ctx.editMessageText(ctx.update.callback_query.message.text + "\n\n🔴 <b>СТАТУС: ОТКЛОНЕН</b>", { parse_mode: 'HTML' });
        await ctx.answerCbQuery("Заказ отклонен.");
    } catch (e) {
        await ctx.answerCbQuery("Ошибка: не удалось отправить сообщение клиенту.");
    }
});

bot.launch().then(() => console.log('🚀 Бот запущен (Версия: фикс лимита Telegram)!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));