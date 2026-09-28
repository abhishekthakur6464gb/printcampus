// Usage: npm run hash -- "NayaPassword"
// Jo output aaye, wahi .env me OWNER_PASSWORD_HASH me paste karo. Plain password kahin save mat karo.
const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash -- "YourPassword"');
  process.exit(1);
}
if (password.length < 6) {
  console.error("Password kam se kam 6 characters ka rakho.");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log(hash);
});
