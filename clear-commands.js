const { REST, Routes } = require("discord.js");

const TOKEN = process.env.TOKEN; // ⚠ même token que dans index.js
const CLIENT_ID = process.env.CLIENT_ID; // ⚠ ID de l'application (pas le guild id)
const GUILD_ID = process.env.GUILD_ID;

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("🚨 Suppression de toutes les commandes globales…");

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [] } // ← liste vide = suppression totale
    );

    console.log("✅ Toutes les commandes slash ont été supprimées !");
  } catch (err) {
    console.error(err);
  }
})();
