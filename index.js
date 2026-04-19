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
    // Сообщение клиенту
    await ctx.reply('✅ Оплата прошла успешно! Спасибо за покупку.');

    try {
        const payment = ctx.message.successful_payment;
        const orderInfo = JSON.parse(payment.invoice_payload);

        // Формируем список товаров
        let itemsList = '';
        for (const [name, count] of Object.entries(orderInfo.items)) {
            if (count > 0) itemsList += `▫️ ${name}: ${count} шт.\n`;
        }

        // Подробный отчет для админа
        let adminNotice = `🚀 **НОВЫЙ ОПЛАЧЕННЫЙ ЗАКАЗ!**\n\n`;
        adminNotice += `👤 **Клиент:** ${orderInfo.name}\n`;
        adminNotice += `📍 **Адрес:** ${orderInfo.address}\n`;
        adminNotice += `💰 **Оплачено:** ${payment.total_amount / 100} сум\n`;
        adminNotice += `🛒 **Товары:**\n${itemsList}\n`;
        adminNotice += `📱 **Связь:** @${ctx.from.username || 'скрыт'}`;

        await bot.telegram.sendMessage(ADMIN_ID, adminNotice, { parse_mode: 'Markdown' });
        
    } catch (err) {
        console.error("Ошибка уведомления:", err);
    }
});

bot.launch().then(() => {
    console.log('Бот запущен с уведомлениями для админа!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));