const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN; // ⚠ même token que dans index.js
const CLIENT_ID = process.env.CLIENT_ID; // ⚠ ID de l'application (pas le guild id)

const commands = [];

commands.push(
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("S'inscrire comme joueur pour les tirages.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("viewplayers")
    .setDescription("Voir, reset et exporter la liste des joueurs inscrits.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("tirage")
    .setDescription("Effectuer un tirage au sort.")
    .addStringOption((option) =>
      option
        .setName("cible")
        .setDescription("Qui participe au tirage ?")
        .setRequired(true)
        .addChoices(
          { name: "Tous les membres humains du serveur", value: "tous" },
          { name: "Uniquement les inscrits (/player)", value: "inscrits" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nombre de gagnants")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("nom").setDescription("Nom du tirage").setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("prix")
        .setDescription("Nom ou description du prix (facultatif)")
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription(
          "Salon où annoncer le tirage (sinon celui de la commande)"
        )
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription(
          "Rôle à donner aux gagnants (facultatif, jamais aux bots)"
        )
        .setRequired(false)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("calendrieravent")
    .setDescription("Configurer un calendrier de l'Avent (1–24 décembre).")
    .addStringOption((option) =>
      option
        .setName("cible")
        .setDescription("Qui participe aux tirages du calendrier ?")
        .setRequired(true)
        .addChoices(
          { name: "Tous les membres humains du serveur", value: "tous" },
          { name: "Uniquement les inscrits (/player)", value: "inscrits" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nombre de gagnants par jour")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("heure")
        .setDescription("Heure du tirage (0–23, défaut 12)")
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon des annonces (sinon salon par défaut)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription(
          "Rôle à donner aux gagnants (facultatif, jamais aux bots)"
        )
        .setRequired(false)
    )
);

const commandsJSON = commands.map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Déploiement des commandes...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commandsJSON,
    });
    console.log("Commandes slash déployées avec succès.");
  } catch (error) {
    console.error("Erreur lors du déploiement des commandes :", error);
  }
})();
