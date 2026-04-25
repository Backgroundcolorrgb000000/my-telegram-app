const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const http = require('http');

const token = process.env.BOT_TOKEN;
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN; 
const ADMIN_ID = process.env.ADMIN_ID; 

// Версия v=7 (обновление кэша для выбора доставки)
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/?v=7';

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running');
}).listen(port);

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

        await ctx.replyWithInvoice({
            title: 'Мебель FORMA',
            description: 'Оплата заказа',
            payload: JSON.stringify({ 
                items: data.products,
                cName: data.customerName,
                cPhone: data.customerPhone,
                cAddress: data.deliveryAddress,
                cDelivery: data.deliveryMethod // Захватываем способ доставки
            }),
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
        const payload = JSON.parse(payment.invoice_payload);
        const userId = ctx.from.id;
        
        const itemsStr = Object.entries(payload.items || {})
            .map(([id, qty]) => `${id} (${qty}шт)`)
            .join(', ');

        const rowData = {
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": `${payload.cName} (${payload.cPhone})`,
            "Адрес": `${payload.cDelivery} - ${payload.cAddress}`, // Пишем тип доставки и адрес
            "Сумма ($)": payment.total_amount / 100,
            "Товары": itemsStr,
            "ID пользователя": String(userId)
        };

        await saveOrderToSheets(rowData);
        await ctx.reply("✨ Оплата прошла успешно! Ожидайте подтверждения.");

        // Обновленное уведомление админу с учетом способа доставки
        if (ADMIN_ID) {
            const adminMsg = `💰 <b>НОВЫЙ ЗАКАЗ!</b>\n\n` +
                             `👤 <b>Клиент:</b> ${payload.cName}\n` +
                             `📞 <b>Телефон:</b> ${payload.cPhone}\n` +
                             `🚚 <b>Тип доставки:</b> ${payload.cDelivery}\n` +
                             `📍 <b>Адрес:</b> ${payload.cAddress}\n` +
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

bot.launch().then(() => console.log('🚀 Бот запущен (Версия 7: калькулятор доставки)!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));