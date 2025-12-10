console.log("Hello CodeSandbox");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const TOKEN = process.env.TOKEN;

const guildStates = new Map();
const pendingCalendars = new Map();

function getGuildState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      players: new Set(),
      calendar: null,
    });
  }
  return guildStates.get(guildId);
}

function pickRandomUnique(arr, count) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function isDecemberAvent(date) {
  const month = date.getMonth();
  const day = date.getDate();
  return month === 11 && day >= 1 && day <= 24;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot connecté en tant que ${c.user.tag}`);
  processAllCalendars(true);
  setInterval(() => processAllCalendars(false), 60000);
});

async function runCalendarDrawForDay(
  guild,
  state,
  day,
  options = { retro: false }
) {
  const cal = state.calendar;
  if (!cal || !cal.active) return;
  if (cal.doneDays.has(day)) return;

  const channel =
    (cal.channelId && guild.channels.cache.get(cal.channelId)) ||
    guild.systemChannel ||
    guild.channels.cache.find((ch) => ch.isTextBased && ch.viewable);

  if (!channel || !channel.isTextBased()) {
    console.log(`Pas de salon texte pour le calendrier sur ${guild.id}`);
    return;
  }

  const reward =
    cal.rewards[day - 1] ||
    cal.rewards[cal.rewards.length - 1] ||
    "Récompense non spécifiée";

  let participantIds = [];
  if (cal.scope === "inscrits") {
    participantIds = Array.from(state.players);
  } else {
    await guild.members.fetch().catch(() => null);
    participantIds = guild.members.cache
      .filter((m) => !m.user.bot)
      .map((m) => m.id);
  }

  if (participantIds.length === 0) {
    await channel.send(
      `Impossible de faire le tirage pour le ${day} décembre : aucun participant.`
    );
    cal.doneDays.add(day);
    return;
  }

  const winners = pickRandomUnique(participantIds, cal.winnersPerDay);

  const embed = new EmbedBuilder()
    .setTitle(`Tirage du calendrier de l'Avent — Jour ${day}`)
    .setColor(options.retro ? 0xffb300 : 0x00c853)
    .addFields(
      { name: "Récompense", value: reward, inline: false },
      {
        name: "Gagnant(s)",
        value: winners.map((id) => `<@${id}>`).join("\n"),
        inline: false,
      },
      {
        name: "Participants",
        value: `${participantIds.length} joueur(s) éligible(s)`,
        inline: true,
      },
      {
        name: "Nombre de gagnants",
        value: `${cal.winnersPerDay}`,
        inline: true,
      }
    )
    .setTimestamp();

  if (options.retro) {
    embed.setFooter({
      text: "Tirage rétroactif (bot lancé après la date du jour).",
    });
  }

  await channel.send({ embeds: [embed] });

  for (const id of winners) {
    try {
      const member = await guild.members.fetch(id).catch(() => null);
      if (!member) continue;

      try {
        await member.send(
          `Tu as gagné le jour ${day} du calendrier de l'Avent sur ${guild.name} ! Récompense : ${reward}`
        );
      } catch (_) {}

      if (cal.roleId && !member.user.bot) {
        await member.roles.add(cal.roleId).catch(() => null);
      }
    } catch (err) {
      console.error("Erreur gagnant calendrier:", err);
    }
  }

  cal.doneDays.add(day);
}

async function processAllCalendars(retroAtStartup) {
  const now = new Date();
  if (!isDecemberAvent(now)) {
    if (retroAtStartup) {
      console.log("Démarrage hors décembre : aucun calendrier traité.");
    }
    return;
  }

  for (const [guildId, state] of guildStates.entries()) {
    const cal = state.calendar;
    if (!cal || !cal.active) continue;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const day = now.getDate();

    if (retroAtStartup) {
      for (let d = 1; d < day; d++) {
        if (!cal.doneDays.has(d)) {
          await runCalendarDrawForDay(guild, state, d, { retro: true });
        }
      }
    }

    const hour = now.getHours();
    if (
      !cal.doneDays.has(day) &&
      hour >= cal.hour &&
      hour >= 10 &&
      hour <= 18
    ) {
      await runCalendarDrawForDay(guild, state, day, { retro: false });
    }
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) {
    return interaction.reply({
      content: "Ce bot fonctionne uniquement dans un serveur.",
      ephemeral: true,
    });
  }

  const guildId = interaction.guild.id;
  const state = getGuildState(guildId);

  if (interaction.commandName === "player") {
    state.players.add(interaction.user.id);
    return interaction.reply({
      content: "Tu es maintenant inscrit pour les tirages.",
      ephemeral: true,
    });
  }

  if (interaction.commandName === "viewplayers") {
    const playersArray = Array.from(state.players);

    const embed = new EmbedBuilder()
      .setTitle("Joueurs inscrits")
      .setColor(0x00aeff)
      .setDescription(
        playersArray.length > 0
          ? playersArray.map((id) => `• <@${id}>`).join("\n")
          : "Aucun joueur inscrit pour l'instant."
      )
      .setFooter({ text: `Total : ${playersArray.length} joueur(s)` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("players_reset_ask")
        .setLabel("Reset")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("players_export")
        .setLabel("Exporter")
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  }

  if (interaction.commandName === "tirage") {
    const scope = interaction.options.getString("cible", true);
    const winnersCount = interaction.options.getInteger("nombre", true);
    const drawName = interaction.options.getString("nom", true);
    const prize = interaction.options.getString("prix") || "Sans récompense";
    const channelOption = interaction.options.getChannel("salon");
    const roleOption = interaction.options.getRole("role");

    const announceChannel = channelOption || interaction.channel;

    let participantIds = [];
    if (scope === "inscrits") {
      participantIds = Array.from(state.players);
    } else {
      await interaction.guild.members.fetch().catch(() => null);
      participantIds = interaction.guild.members.cache
        .filter((m) => !m.user.bot)
        .map((m) => m.id);
    }

    if (participantIds.length === 0) {
      return interaction.reply({
        content: "Aucun participant disponible pour ce tirage.",
        ephemeral: true,
      });
    }

    if (winnersCount <= 0) {
      return interaction.reply({
        content: "Le nombre de gagnants doit être au moins de 1.",
        ephemeral: true,
      });
    }

    if (winnersCount > participantIds.length) {
      return interaction.reply({
        content: `Il n'y a pas assez de participants (max ${participantIds.length} gagnant(s)).`,
        ephemeral: true,
      });
    }

    const winners = pickRandomUnique(participantIds, winnersCount);

    const embed = new EmbedBuilder()
      .setTitle(`Tirage : ${drawName}`)
      .setColor(0x00c853)
      .addFields(
        { name: "Récompense", value: prize, inline: false },
        {
          name: "Gagnant(s)",
          value: winners.map((id) => `• <@${id}>`).join("\n"),
          inline: false,
        },
        {
          name: "Participants",
          value: `${participantIds.length} joueur(s) éligible(s)`,
          inline: true,
        },
        {
          name: "Nombre de gagnants",
          value: `${winnersCount}`,
          inline: true,
        }
      )
      .setTimestamp();

    await announceChannel.send({ embeds: [embed] });

    for (const id of winners) {
      try {
        const member = await interaction.guild.members
          .fetch(id)
          .catch(() => null);
        if (!member) continue;

        try {
          await member.send(
            `Tu as gagné le tirage "${drawName}" sur ${interaction.guild.name} ! Récompense : ${prize}`
          );
        } catch (_) {}

        if (roleOption && !member.user.bot) {
          await member.roles.add(roleOption).catch(() => null);
        }
      } catch (err) {
        console.error("Erreur gagnant tirage:", err);
      }
    }

    return interaction.reply({
      content: `Tirage "${drawName}" effectué avec succès pour ${winnersCount} gagnant(s).`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "calendrieravent") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isAdmin =
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (!isAdmin) {
      return interaction.reply({
        content:
          "Tu dois être administrateur pour configurer le calendrier de l'Avent.",
        ephemeral: true,
      });
    }

    const scope = interaction.options.getString("cible", true);
    const winnersPerDay = interaction.options.getInteger("nombre", true);
    let hour = interaction.options.getInteger("heure") ?? 12;
    const channelOption = interaction.options.getChannel("salon");
    const roleOption = interaction.options.getRole("role");

    if (winnersPerDay <= 0) {
      return interaction.reply({
        content: "Le nombre de gagnants par jour doit être au moins de 1.",
        ephemeral: true,
      });
    }

    if (hour < 0 || hour > 23) hour = 12;

    pendingCalendars.set(`${guildId}:${interaction.user.id}`, {
      scope,
      winnersPerDay,
      hour,
      channelId: channelOption ? channelOption.id : null,
      roleId: roleOption ? roleOption.id : null,
    });

    const modal = new ModalBuilder()
      .setCustomId("cal_avent_modal")
      .setTitle("Récompenses du calendrier (1 à 24)");

    const input = new TextInputBuilder()
      .setCustomId("cal_avent_rewards")
      .setLabel("Une ligne par jour (1 → 24)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        "Jour 1 : 1000€\nJour 2 : G36\nJour 3 : Item...\n...\nJour 24 : 20000€"
      )
      .setRequired(true)
      .setMaxLength(2000);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (!interaction.inGuild()) return;

    const guildId = interaction.guild.id;
    const state = getGuildState(guildId);

    if (interaction.customId === "players_reset_ask") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isAdmin =
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageGuild);

      if (!isAdmin) {
        return interaction.reply({
          content:
            "Tu dois être administrateur pour reset la liste des joueurs.",
          ephemeral: true,
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("players_reset_confirm")
          .setLabel("Confirmer le reset")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("players_reset_cancel")
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        content: "Tu es sûr de vouloir reset la liste des joueurs inscrits ?",
        components: [row],
        ephemeral: true,
      });
    }

    if (interaction.customId === "players_reset_confirm") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const isAdmin =
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        member.permissions.has(PermissionsBitField.Flags.ManageGuild);

      if (!isAdmin) {
        return interaction.reply({
          content:
            "Tu dois être administrateur pour reset la liste des joueurs.",
          ephemeral: true,
        });
      }

      state.players.clear();
      return interaction.update({
        content: "Liste des joueurs inscrits réinitialisée.",
        components: [],
      });
    }

    if (interaction.customId === "players_reset_cancel") {
      return interaction.update({
        content: "Reset annulé.",
        components: [],
      });
    }

    if (interaction.customId === "players_export") {
      const playersArray = Array.from(state.players);
      const text =
        playersArray.length > 0
          ? playersArray.map((id) => `<@${id}>`).join("\n")
          : "Aucun joueur inscrit.";

      return interaction.reply({
        content: "Export des joueurs inscrits:\n" + text,
        ephemeral: true,
      });
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "cal_avent_modal") {
      if (!interaction.inGuild()) {
        return interaction.reply({
          content: "Ce bot fonctionne uniquement dans un serveur.",
          ephemeral: true,
        });
      }

      const guildId = interaction.guild.id;
      const key = `${guildId}:${interaction.user.id}`;
      const baseConfig = pendingCalendars.get(key);

      if (!baseConfig) {
        return interaction.reply({
          content: "Aucune configuration de calendrier en cours.",
          ephemeral: true,
        });
      }

      pendingCalendars.delete(key);

      const state = getGuildState(guildId);

      const rewardsRaw =
        interaction.fields.getTextInputValue("cal_avent_rewards");
      const lines = rewardsRaw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length !== 24) {
        return interaction.reply({
          content:
            "Tu dois entrer exactement 24 lignes, une par jour du 1 au 24.",
          ephemeral: true,
        });
      }

      const rewards = lines.slice(0, 24);

      state.calendar = {
        active: true,
        scope: baseConfig.scope,
        winnersPerDay: baseConfig.winnersPerDay,
        hour: baseConfig.hour,
        channelId: baseConfig.channelId,
        roleId: baseConfig.roleId,
        rewards,
        doneDays: new Set(),
      };

      await interaction.reply({
        content:
          "Calendrier de l'Avent configuré pour ce serveur.\n" +
          "Période : 1er au 24 décembre\n" +
          `Tirage chaque jour vers ${baseConfig.hour}h (entre 10h et 18h).\n` +
          `Nombre de gagnants par jour : ${baseConfig.winnersPerDay}\n` +
          `Cible : ${
            baseConfig.scope === "inscrits"
              ? "inscrits"
              : "tous les membres humains"
          }\n` +
          `Salon : ${
            baseConfig.channelId ? `<#${baseConfig.channelId}>` : "par défaut"
          }`,
        ephemeral: true,
      });

      await processAllCalendars(true);
    }
  }
});
client.login(TOKEN);

const express = require("express");
const server = express();

server.all("/", (req, res) => {
  res.send("Bot Online");
});

// ⚠️ Render te donne un port automatiquement
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Serveur actif sur le port ${PORT}`);
});
