import 'dotenv/config';

const token = process.env.BOT_TOKEN;
const url = process.env.APP_URL;
if (!token || !url || !url.startsWith('https://')) {
  console.error('Set BOT_TOKEN and APP_URL (a public https:// URL) in your .env first.');
  process.exit(1);
}
const response = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ menu_button: { type: 'web_app', text: 'Open Student Hub', web_app: { url } } })
});
const result = await response.json();
if (!response.ok || !result.ok) {
  console.error('Telegram could not set the menu button:', result.description || result);
  process.exit(1);
}
console.log('Success: the bot menu button now opens Student Hub.');
