const { Telegraf } = require('telegraf');

// 1. Токен бота
const bot = new Telegraf('8474220877:AAHmSXn0v-MRbWSZMAWGr16EYoPF1SXD3SQ');

// 2. Ссылка на Mini App
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

// 3. Твой платежный токен (Smart Glocal Test)
const PAYMENT_TOKEN = '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';

// 4. ТВОЙ ID (получи его у @userinfobot и вставь сюда вместо цифр ниже)
const ADMIN_ID = 1296940843; 

bot.start((ctx) => {
    ctx.reply('Магазин мебели в Ташкенте открыт! Нажми кнопку:', {
        reply_markup: {
            keyboard: [
                [{ text: "🛒 Открыть каталог", web_app: { url: webAppUrl } }]
            ],
            resize_keyboard: true
        }
    });
});

bot.on('web_app_data', async (ctx) => {
    try {
        const data = JSON.parse(ctx.webAppData.data.text());
        const totalAmount = Math.round(data.totalPrice);

        if (!totalAmount || totalAmount <= 0) {
            return await ctx.reply('❌ Ошибка: Корзина пуста');
        }

        await ctx.reply(`✅ Заказ принят на сумму ${totalAmount} сум. Формирую чек...`);

        // Выставление счета
        await ctx.replyWithInvoice({
            title: 'Оплата мебели',
            description: 'Заказ в магазине Mebel Shop',
            // Мы упаковываем все данные заказа в payload, чтобы получить их после оплаты
            payload: JSON.stringify({
                name: data.customerName,
                address: data.customerAddress,
                items: data.products
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [
                { label: 'Товары', amount: totalAmount * 100 }
            ],
            start_parameter: 'mebel-shop-order'
        });

    } catch (e) {
        console.error("Ошибка при создании счета:", e);
        await ctx.reply(`❌ Ошибка: ${e.message || 'Не удалось создать счет'}`);
    }
});

bot.on('pre_checkout_query', (ctx) => {
    ctx.answerPreCheckoutQuery(true).catch(err => {
        console.error("Ошибка pre_checkout:", err);
    });
});

bot.on('successful_payment', async (ctx) => {
    // 1. Сообщение клиенту
    await ctx.reply('✅ Оплата прошла успешно! Мы уже начали готовить ваш заказ.');

    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);
        const userId = ctx.from.id; // ID покупателя для уведомлений

        // Список товаров
        let itemsList = '';
        for (const [name, count] of Object.entries(orderInfo.items)) {
            if (count > 0) itemsList += `▫️ ${name}: ${count} шт.\n`;
        }

        // Отчет для АДМИНА с кнопками действий
        let adminNotice = `🚀 **НОВЫЙ ОПЛАЧЕННЫЙ ЗАКАЗ!**\n\n`;
        adminNotice += `👤 **Клиент:** ${orderInfo.name}\n`;
        adminNotice += `📍 **Адрес:** ${orderInfo.address}\n`;
        adminNotice += `💰 **Сумма:** ${payment.total_amount / 100} сум\n`;
        adminNotice += `🛒 **Товары:**\n${itemsList}`;

        await bot.telegram.sendMessage(ADMIN_ID, adminNotice, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    // В callback_data прячем действие и ID клиента, чтобы знать кому слать пуш
                    [{ text: '👨‍🔧 В сборку', callback_data: `status_assembling_${userId}` }],
                    [{ text: '🚚 Передать курьеру', callback_data: `status_delivery_${userId}` }],
                    [{ text: '✅ Доставлено', callback_data: `status_completed_${userId}` }]
                ]
            }
        });
    } catch (err) {
        console.error("Ошибка в успешной оплате:", err);
    }
});

bot.launch().then(() => {
    console.log('Бот запущен с уведомлениями для админа!');
});


bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    // Разбираем данные: что сделать и кому отправить
    if (data.startsWith('status_')) {
        const [_, action, targetUserId] = data.split('_');
        let messageToUser = '';
        let adminStatusUpdate = '';

        if (action === 'assembling') {
            messageToUser = '🛠 Ваш заказ мебели передан в цех на сборку!';
            adminStatusUpdate = '👷‍♂️ Заказ переведен в статус: **В сборке**';
        } else if (action === 'delivery') {
            messageToUser = '🚛 Ура! Ваша мебель уже в пути. Курьер свяжется с вами в ближайшее время.';
            adminStatusUpdate = '🚚 Заказ переведен в статус: **Доставка**';
        } else if (action === 'completed') {
            messageToUser = '🏠 Заказ доставлен. Спасибо, что выбрали Mebel Shop! Будем рады отзыву.';
            adminStatusUpdate = '✅ Заказ отмечен как **Выполненный**';
        }

        try {
            // Отправляем уведомление клиенту
            await bot.telegram.sendMessage(targetUserId, messageToUser);
            
            // Подтверждаем админу, что статус изменен
            await ctx.answerCbQuery('Статус обновлен');
            await ctx.editMessageCaption ? await ctx.editMessageCaption(adminStatusUpdate) : await ctx.reply(adminStatusUpdate);
        } catch (e) {
            console.error("Ошибка смены статуса:", e);
            await ctx.answerCbQuery('Ошибка при отправке уведомления');
        }
    }
});



process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));