const { Telegraf } = require('telegraf');

const bot = new Telegraf('8474220877:AAHmSXn0v-MRbWSZMAWGr16EYoPF1SXD3SQ');
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

// ВСТАВЬТЕ СВОЙ ID (вы его уже знаете, раз уведомления приходили)
const ADMIN_ID = 534728190; 

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
                userId: ctx.from.id // Сохраняем ID пользователя для статусов
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Товары', amount: totalAmount * 100 }],
            start_parameter: 'mebel-order'
        });
    } catch (e) {
        console.error(e);
        ctx.reply('❌ Ошибка при формировании заказа');
    }
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', async (ctx) => { 
    try {
        await ctx.reply('✅ Оплата получена!'); // Теперь await будет работать
        
        const payment = ctx.message.successful_payment;
        // ... остальной код
    } catch (e) {
        console.error(e);
    }
});

    // Уведомление АДМИНУ с кнопками
    await bot.telegram.sendMessage(ADMIN_ID, `🚀 **НОВЫЙ ЗАКАЗ!**\n\n👤 ${orderInfo.name}\n📍 ${orderInfo.address}\n💰 ${payment.total_amount / 100} сум\n🛒 Товары:\n${itemsList}`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🛠 В сборку', callback_data: `st_build_${orderInfo.userId}` }],
                [{ text: '🚚 Курьеру', callback_data: `st_ship_${orderInfo.userId}` }],
                [{ text: '✅ Завершить', callback_data: `st_done_${orderInfo.userId}` }]
            ]
        }
    });
});

// ОБРАБОТКА КНОПОК СТАТУСА
bot.on('callback_query', async (ctx) => {
    const [prefix, action, targetId] = ctx.callbackQuery.data.split('_');
    if (prefix !== 'st') return;

    let text = '';
    if (action === 'build') text = '🛠 Ваш заказ передан на сборку!';
    if (action === 'ship') text = '🚚 Ваша мебель уже в пути с курьером!';
    if (action === 'done') text = '✅ Заказ доставлен! Спасибо за покупку.';

    try {
        await bot.telegram.sendMessage(targetId, text);
        await ctx.answerCbQuery('Статус отправлен клиенту');
        // Обновляем текст сообщения у админа, чтобы видеть текущий статус
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\nСтатус: ${text}`, { parse_mode: 'Markdown' });
    } catch (e) {
        await ctx.answerCbQuery('Ошибка: пользователь заблокировал бота');
    }
});

bot.launch();