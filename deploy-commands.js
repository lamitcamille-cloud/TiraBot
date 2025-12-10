const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const TOKEN = process.env.TOKEN || "TON_TOKEN_ICI";
const CLIENT_ID = process.env.CLIENT_ID || "TON_CLIENT_ID";

const commands = [];

commands.push(
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Voir l'aide de TiraBot.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Voir les infos du bot sur ce serveur.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("S'inscrire comme joueur pour les tirages.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("viewplayers")
    .setDescription("Voir la liste des joueurs inscrits (pagination).")
);

commands.push(
  new SlashCommandBuilder()
    .setName("random")
    .setDescription("Tirage simple et rapide.")
    .addStringOption((option) =>
      option
        .setName("cible")
        .setDescription("Qui participe au tirage ?")
        .setRequired(false)
        .addChoices(
          { name: "Uniquement les inscrits (/player)", value: "inscrits" },
          { name: "Tous les membres humains du serveur", value: "tous" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nombre de personnes à tirer au sort")
        .setRequired(false)
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Créer un panneau avec bouton pour s'inscrire.")
);

commands.push(
  new SlashCommandBuilder()
    .setName("blacklistuser")
    .setDescription("Gérer la blacklist d'utilisateurs.")
    .addUserOption((option) =>
      option
        .setName("utilisateur")
        .setDescription("Utilisateur à ajouter/retirer de la blacklist.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Ajouter ou retirer.")
        .setRequired(true)
        .addChoices(
          { name: "Ajouter", value: "add" },
          { name: "Retirer", value: "remove" }
        )
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName("blacklistrole")
    .setDescription("Gérer la blacklist de rôles.")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Rôle à ajouter/retirer de la blacklist.")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Ajouter ou retirer.")
        .setRequired(true)
        .addChoices(
          { name: "Ajouter", value: "add" },
          { name: "Retirer", value: "remove" }
        )
    )
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
      option
        .setName("nom")
        .setDescription("Nom du tirage")
        .setRequired(true)
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
        .setDescription("Salon où annoncer le tirage (sinon celui de la commande)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Rôle à donner aux gagnants (facultatif, jamais aux bots)")
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
        .setDescription("Rôle à donner aux gagnants (facultatif, jamais aux bots)")
        .setRequired(false)
    )
);

const commandsJSON = commands.map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Déploiement des commandes...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commandsJSON
    });
    console.log("Commandes slash déployées avec succès.");
  } catch (error) {
    console.error("Erreur lors du déploiement des commandes :", error);
  }
})();
})();
