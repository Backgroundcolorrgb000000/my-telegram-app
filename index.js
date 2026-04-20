const { Telegraf } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. Проверка наличия токена (чтобы бот не падал с 401)
const token = process.env.BOT_TOKEN;
if (!token) {
    console.error("ОШИБКА: BOT_TOKEN не найден в переменных окружения Railway!");
    process.exit(1); 
}

const ADMIN_ID = process.env.ADMIN_ID || 1296940843;
// Используйте переменную окружения для PAYMENT_TOKEN, если это возможно
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN || '1877036958:TEST:9bbcd79d1d9428bc0546e57e5bd0a86fb4eaa2a9';
const webAppUrl = 'https://backgroundcolorrgb000000.github.io/my-telegram-app/';

const bot = new Telegraf(token);

// Настройка Google Sheets
async function saveOrderToSheets(orderData) {
    try {
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            // Исправление обработки секретного ключа
            key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        await sheet.addRow({
            "Дата": new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
            "Имя клиента": orderData.name || 'Не указано',
            "Адрес": orderData.address || 'Самовывоз/Не указан',
            "Сумма (сум)": orderData.amount,
            "Товары": orderData.items,
            "ID пользователя": String(orderData.userId)
        });
        console.log("✅ Заказ записан в Google Sheets");
    } catch (e) {
        console.error("❌ Ошибка Google Sheets:", e.message);
    }
}

bot.start((ctx) => {
    ctx.reply('🛋 Магазин мебели FORMA открыт!', {
        reply_markup: {
            keyboard: [[{ text: "🛒 Открыть каталог", web_app: { url: webAppUrl } }]],
            resize_keyboard: true
        }
    });
});

// Обработка данных из Mini App
bot.on('web_app_data', async (ctx) => {
    try {
        // Проверяем: если это уже объект, берем его, если строка — парсим
        let data;
        try {
            data = typeof ctx.webAppData.data === 'string' 
                ? JSON.parse(ctx.webAppData.data) 
                : ctx.webAppData.data;
        } catch (e) {
            data = ctx.webAppData.data;
        }

        const totalAmount = Math.round(data.totalPrice || 0);

        if (totalAmount <= 0) return ctx.reply('Ошибка: корзина пуста');

        await ctx.reply(`⏳ Формирую чек на сумму ${totalAmount.toLocaleString()} сум...`);

        await ctx.replyWithInvoice({
            title: 'Оплата заказа FORMA',
            description: 'Мебель и предметы интерьера',
            payload: JSON.stringify({
                items: data.products || data.order,
                userId: ctx.from.id 
            }),
            provider_token: PAYMENT_TOKEN,
            currency: 'UZS',
            prices: [{ label: 'Ваш заказ', amount: totalAmount * 100 }],
            start_parameter: 'furniture-order'
        });
    } catch (e) {
        console.error("Ошибка инвойса:", e);
        ctx.reply('Произошла ошибка при формировании счета.');
    }
});


// ОБЯЗАТЕЛЬНО для работы оплаты
bot.on('pre_checkout_query', (ctx) => {
    console.log("💳 Получен запрос на проверку платежа");
    return ctx.answerPreCheckoutQuery(true);
});

// Обработка успешного платежа
bot.on('successful_payment', async (ctx) => { 
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);

        // Формируем список товаров для таблицы и админа
        let itemsList = '';
        if (payload.items) {
            for (const [id, count] of Object.entries(payload.items)) {
                itemsList += `${id} (${count} шт); `;
            }
        }

        const amount = payment.total_amount / 100;

        // 1. Запись в таблицу
        await saveOrderToSheets({
            name: ctx.from.first_name,
            address: 'Уточняется менеджером',
            amount: amount,
            items: itemsList,
            userId: ctx.from.id
        });

        await ctx.reply('✅ Спасибо! Оплата прошла успешно. Менеджер свяжется с вами.');

        // 2. Уведомление АДМИНУ
        await bot.telegram.sendMessage(ADMIN_ID, 
            `🚀 **НОВЫЙ ОПЛАЧЕННЫЙ ЗАКАЗ!**\n\n` +
            `👤 Клиент: ${ctx.from.first_name}\n` +
            `💰 Сумма: ${amount.toLocaleString()} сум\n` +
            `🛒 Товары: ${itemsList}`, 
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛠 В сборку', callback_data: `st_build_${ctx.from.id}` }],
                        [{ text: '✅ Завершить', callback_data: `st_done_${ctx.from.id}` }]
                    ]
                }
            }
        );
    } catch (e) {
        console.error("Ошибка успешного платежа:", e);
    }
});

// Кнопки статуса для админа
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith('st_')) return;

    const [,, targetId] = data.split('_');
    const action = data.includes('build') ? '🛠 Сборка' : '✅ Завершено';

    try {
        await bot.telegram.sendMessage(targetId, `Уведомление: Ваш заказ переведен в статус: ${action}`);
        await ctx.answerCbQuery('Статус обновлен');
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\n📢 **Текущий статус:** ${action}`);
    } catch (e) {
        console.log("Ошибка уведомления клиента:", e.message);
    }
});

bot.launch()
    .then(() => console.log('🚀 Бот успешно запущен и готов к оплатам!'))
    .catch((err) => console.error('Ошибка запуска:', err));

// Мягкая остановка
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));