const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Replace with your keys
const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const HUGGINGFACE_API_KEY = 'YOUR_HUGGINGFACE_API_KEY';

// Initialize bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Create temp directory for file storage
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// Welcome message
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to the AI Creative Bot!\n' +
    '/generate <prompt> - Create a new image\n' +
    '/edit <prompt> - Edit an uploaded image');
});

// Handle image uploads
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  bot.sendMessage(chatId, 'Image received! Use /edit <prompt> to edit it.');
  fs.writeFileSync(path.join(TEMP_DIR, `${chatId}_image.txt`), fileId);
});

// Generate image
bot.onText(/\/generate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const prompt = match[1];

  try {
    bot.sendMessage(chatId, 'Generating image, please wait...');
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
      { inputs: `Advertising creative: ${prompt}` },
      { headers: { Authorization: `Bearer ${HUGGINGFACE_API_KEY}` }, responseType: 'arraybuffer' }
    );

    const imagePath = path.join(TEMP_DIR, `${chatId}_generated.png`);
    fs.writeFileSync(imagePath, response.data);
    await bot.sendPhoto(chatId, imagePath);
    fs.unlinkSync(imagePath); // Clean up
  } catch (error) {
    bot.sendMessage(chatId, 'Error generating image. Try again later.');
    console.error(error);
  }
});

// Edit image
bot.onText(/\/edit (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const prompt = match[1];
  const fileIdPath = path.join(TEMP_DIR, `${chatId}_image.txt`);

  if (!fs.existsSync(fileIdPath)) {
    bot.sendMessage(chatId, 'Please upload an image first.');
    return;
  }

  try {
    bot.sendMessage(chatId, 'Editing image, please wait...');
    const fileId = fs.readFileSync(fileIdPath, 'utf8');
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;

    // Download image
    const imageResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const imagePath = path.join(TEMP_DIR, `${chatId}_input.png`);
    fs.writeFileSync(imagePath, imageResponse.data);

    // Use Hugging Face inpainting model (simplified)
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-inpainting',
      { inputs: prompt, image: fs.readFileSync(imagePath) },
      { headers: { Authorization: `Bearer ${HUGGINGFACE_API_KEY}` }, responseType: 'arraybuffer' }
    );

    const editedPath = path.join(TEMP_DIR, `${chatId}_edited.png`);
    fs.writeFileSync(editedPath, response.data);
    await bot.sendPhoto(chatId, editedPath);

    // Clean up
    fs.unlinkSync(imagePath);
    fs.unlinkSync(editedPath);
    fs.unlinkSync(fileIdPath);
  } catch (error) {
    bot.sendMessage(chatId, 'Error editing image. Try again later.');
    console.error(error);
  }
});

console.log('Bot is running...');