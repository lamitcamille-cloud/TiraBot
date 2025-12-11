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
 AttachmentBuilder
} = require("discord.js");
const express = require("express");
const TOKEN = process.env.TOKEN || "TON_TOKEN_ICI";
const guildStates = new Map();
const pendingCalendars = new Map();
function getGuildState(guildId) {
 if (!guildStates.has(guildId)) {
 guildStates.set(guildId, {
 players: new Set(),
 calendar: null,
 blacklistUsers: new Set(),
 blacklistRoles: new Set()
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
 GatewayIntentBits.GuildMessages
 ],
 partials: [Partials.Channel]
});
function filterParticipantsWithBlacklist(membersArray, state, guild) {
 const blacklistUsers = state.blacklistUsers;
 const blacklistRoles = state.blacklistRoles;
 if (blacklistUsers.size === 0 && blacklistRoles.size === 0) return membersArray;
 return membersArray.filter((id) => {
 if (blacklistUsers.has(id)) return false;
 if (blacklistRoles.size === 0) return true;
 const member = guild.members.cache.get(id);
 if (!member) return true;
 for (const roleId of blacklistRoles) {
 if (member.roles.cache.has(roleId)) return false;
 }
 return true;
 });
}
async function runCalendarDrawForDay(guild, state, day, options = { retro: false }) {
 const cal = state.calendar;
 if (!cal || !cal.active) return;
 if (cal.doneDays.has(day)) return;
 const channel =
 (cal.channelId && guild.channels.cache.get(cal.channelId)) ||
 guild.systemChannel ||
 guild.channels.cache.find((ch) => ch.isTextBased && ch.viewable);
 if (!channel || !channel.isTextBased()) return;
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
 participantIds = filterParticipantsWithBlacklist(participantIds, state, guild);
 if (participantIds.length === 0) {
 await channel.send(
 `Impossible de faire le tirage pour le ${day} décembre : aucun participant éligible.`
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
 inline: false
 },
 {
 name: "Participants",
 value: `${participantIds.length} joueur(s) éligible(s)`,
 inline: true
 },
 {
 name: "Nombre de gagnants",
 value: `${cal.winnersPerDay}`,
 inline: true
 }
 )
 .setTimestamp();
 if (options.retro) {
 embed.setFooter({
 text: "Tirage rétroactif (bot lancé après la date du jour)."
 });
 }
 await channel.send({ embeds: [embed] });
 for (const id of winners) {
 try {
 const member = await guild.members.fetch(id).catch(() => null);
 if (!member) continue;
 try {
 await member.send(
 `Tu as gagné le jour ${day} du calendrier de l'Avent sur ${guild.name} ! Récompense : $
{reward}`
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
async function processAllCalendars(retroAtStartup, client) {
 const now = new Date();
 if (!isDecemberAvent(now)) return;
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
 if (!cal.doneDays.has(day) && hour >= cal.hour && hour >= 10 && hour <= 18) {
 await runCalendarDrawForDay(guild, state, day, { retro: false });
 }
 }
}
function buildPlayersPageEmbed(state, page) {
 const perPage = 5;
 const all = Array.from(state.players);
 const total = all.length;
 const totalPages = Math.max(1, Math.ceil(total / perPage));
 let currentPage = page;
 if (currentPage < 1) currentPage = 1;
 if (currentPage > totalPages) currentPage = totalPages;
 const start = (currentPage - 1) * perPage;
 const slice = all.slice(start, start + perPage);
 const description =
 slice.length > 0
 ? slice.map((id, index) => `${start + index + 1}. <@${id}>`).join("\n")
 : "Aucun joueur inscrit pour l'instant.";
 const embed = new EmbedBuilder()
 .setTitle("Joueurs inscrits")
 .setColor(0x00aeff)
 .setDescription(description)
 .setFooter({
 text: `Page ${currentPage}/${totalPages} • Total : ${total} joueur(s)`
 });
 const rowNav = new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId("vp_first")
 .setEmoji("⏮ ")
 .setStyle(ButtonStyle.Secondary),
 new ButtonBuilder()
 .setCustomId("vp_prev2")
 .setEmoji("⏪ ")
 .setStyle(ButtonStyle.Secondary),
 new ButtonBuilder()
 .setCustomId("vp_prev")
 .setEmoji("◀ ")
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId("vp_next")
 .setEmoji("▶ ")
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId("vp_next2")
 .setEmoji("⏩ ")
 .setStyle(ButtonStyle.Secondary)
 );
 const rowActions = new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId("players_reset_ask")
 .setLabel("Reset")
 .setStyle(ButtonStyle.Danger),
 new ButtonBuilder()
 .setCustomId("players_save")
 .setLabel("Sauvegarder (.txt)")
 .setStyle(ButtonStyle.Secondary)
 );
 return { embed, components: [rowNav, rowActions] };
}
function getPageFromFooter(embed) {
 if (!embed || !embed.footer || !embed.footer.text)
 return { page: 1, total: 1 };
 const m = embed.footer.text.match(/Page\s+(\d+)\s*\/\s*(\d+)/i);
 if (!m) return { page: 1, total: 1 };
 return {
 page: parseInt(m[1], 10) || 1,
 total: parseInt(m[2], 10) || 1
 };
}
client.once(Events.ClientReady, (c) => {
 console.log(`Bot connecté en tant que ${c.user.tag}`);
 processAllCalendars(true, client);
 setInterval(() => processAllCalendars(false, client), 60000);
});
client.on(Events.InteractionCreate, async (interaction) => {
 if (!interaction.isChatInputCommand()) return;
 if (!interaction.inGuild()) {
 return interaction.reply({
 content: "Ce bot fonctionne uniquement dans un serveur.",
 ephemeral: true
 });
 }
 const guildId = interaction.guild.id;
 const state = getGuildState(guildId);
 if (interaction.commandName === "help") {
 const embed = new EmbedBuilder()
 .setTitle("Aide TiraBot")
 .setColor(0x00aeff)
 .setDescription(
 [
 "/help : liste des commandes",
 "/info : infos sur la config du bot",
 "/player : t'inscrire comme joueur",
 "/viewplayers : voir les joueurs inscrits (pagination)",
 "/tirage : tirage classique",
 "/calendrieravent : config calendrier de l'Avent",
 "/random : tirage rapide",
 "/panel : panneau avec bouton pour t'inscrire",
 "/blacklistuser : ajouter/enlever un joueur de la blacklist",
 "/blacklistrole : ajouter/enlever un rôle de la blacklist"
 ].join("\n")
 );
 return interaction.reply({ embeds: [embed], ephemeral: true });
 }
 if (interaction.commandName === "info") {
 const playersCount = state.players.size;
 const calendar = state.calendar;
 const blUsers = state.blacklistUsers.size;
 const blRoles = state.blacklistRoles.size;
 const lines = [];
 lines.push(`Joueurs inscrits : **${playersCount}**`);
 lines.push(`Utilisateurs blacklistés : **${blUsers}**`);
 lines.push(`Rôles blacklistés : **${blRoles}**`);
 if (calendar && calendar.active) {
 lines.push(
 `Calendrier de l'Avent : **actif** • ${calendar.winnersPerDay} gagnant(s)/jour vers $
{calendar.hour}h`
 );
 } else {
 lines.push("Calendrier de l'Avent : **inactif**");
 }
 const embed = new EmbedBuilder()
 .setTitle("Infos du serveur")
 .setColor(0x00aeff)
 .setDescription(lines.join("\n"));
 return interaction.reply({ embeds: [embed], ephemeral: true });
 }
 // ===== /player avec blacklist =====
 if (interaction.commandName === "player") {
 const isBlacklistedUser = state.blacklistUsers.has(interaction.user.id);
 let isBlacklistedRole = false;
 if (state.blacklistRoles.size > 0) {
 for (const roleId of state.blacklistRoles) {
 if (interaction.member.roles.cache.has(roleId)) {
 isBlacklistedRole = true;
 break;
 }
 }
 }
 if (isBlacklistedUser || isBlacklistedRole) {
 return interaction.reply({
 content: "Tu es blacklisté, tu ne peux pas t'inscrire.",
 ephemeral: true
 });
 }
 state.players.add(interaction.user.id);
 return interaction.reply({
 content: "Tu es maintenant inscrit pour les tirages.",
 ephemeral: true
 });
 }
 // ===== /viewplayers sécurisé (si 0 joueurs) =====
 if (interaction.commandName === "viewplayers") {
 if (!state.players || state.players.size === 0) {
 return interaction.reply({
 content: "Aucun joueur inscrit pour l'instant.",
 ephemeral: true
 });
 }
 const pageData = buildPlayersPageEmbed(state, 1);
 return interaction.reply({
 embeds: [pageData.embed],
 components: pageData.components,
 ephemeral: true
 });
 }
 if (interaction.commandName === "random") {
 const scope = interaction.options.getString("cible") || "inscrits";
 const count = interaction.options.getInteger("nombre") || 1;
 let participantIds = [];
 if (scope === "inscrits") {
 participantIds = Array.from(state.players);
 } else {
 await interaction.guild.members.fetch().catch(() => null);
 participantIds = interaction.guild.members.cache
 .filter((m) => !m.user.bot)
 .map((m) => m.id);
 }
 participantIds = filterParticipantsWithBlacklist(
 participantIds,
 state,
 interaction.guild
 );
 if (participantIds.length === 0) {
 return interaction.reply({
 content: "Aucun participant éligible.",
 ephemeral: true
 });
 }
 const n = Math.min(count, participantIds.length);
 const winners = pickRandomUnique(participantIds, n);
 return interaction.reply({
 content:
 `Résultat random (${scope === "inscrits" ? "inscrits" : "tout le serveur"}) :\n` +
 winners.map((id) => `• <@${id}>`).join("\n"),
 ephemeral: true
 });
 }
 if (interaction.commandName === "panel") {
 const embed = new EmbedBuilder()
 .setTitle("Panel d'inscription")
 .setColor(0x00aeff)
 .setDescription("Clique sur un bouton ci-dessous pour t'inscrire.");
 const row = new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId("panel_register")
 .setLabel("M'enregistrer (/player)")
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId("panel_participate")
 .setLabel("Participer au tirage")
 .setStyle(ButtonStyle.Success)
 );
 return interaction.reply({ embeds: [embed], components: [row] });
 }
 if (interaction.commandName === "blacklistuser") {
 const user = interaction.options.getUser("utilisateur", true);
 const action = interaction.options.getString("action", true);
 if (action === "add") {
 state.blacklistUsers.add(user.id);
 state.players.delete(user.id);
 return interaction.reply({
 content: `${user} a été ajouté à la blacklist et retiré des inscrits.`,
 ephemeral: true
 });
 } else {
 state.blacklistUsers.delete(user.id);
 return interaction.reply({
 content: `${user} a été retiré de la blacklist.`,
 ephemeral: true
 });
 }
 }
 if (interaction.commandName === "blacklistrole") {
 const role = interaction.options.getRole("role", true);
 const action = interaction.options.getString("action", true);
 if (action === "add") {
 state.blacklistRoles.add(role.id);
 for (const userId of Array.from(state.players)) {
 const member = interaction.guild.members.cache.get(userId);
 if (member && member.roles.cache.has(role.id)) {
 state.players.delete(userId);
 }
 }
 return interaction.reply({
 content: `${role} a été ajouté à la blacklist.`,
 ephemeral: true
 });
 } else {
 state.blacklistRoles.delete(role.id);
 return interaction.reply({
 content: `${role} a été retiré de la blacklist.`,
 ephemeral: true
 });
 }
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
 participantIds = filterParticipantsWithBlacklist(
 participantIds,
 state,
 interaction.guild
 );
 if (participantIds.length === 0) {
 return interaction.reply({
 content: "Aucun participant disponible pour ce tirage.",
 ephemeral: true
 });
 }
 if (winnersCount <= 0) {
 return interaction.reply({
 content: "Le nombre de gagnants doit être au moins de 1.",
 ephemeral: true
 });
 }
 if (winnersCount > participantIds.length) {
 return interaction.reply({
 content: `Il n'y a pas assez de participants (max ${participantIds.length} gagnant(s)).`,
 ephemeral: true
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
 inline: false
 },
 {
 name: "Participants",
 value: `${participantIds.length} joueur(s) éligible(s)`,
 inline: true
 },
 {
 name: "Nombre de gagnants",
 value: `${winnersCount}`,
 inline: true
 }
 )
 .setTimestamp();
 await announceChannel.send({ embeds: [embed] });
 for (const id of winners) {
 try {
 const member = await interaction.guild.members.fetch(id).catch(() => null);
 if (!member) continue;
 try {
 await member.send(
 `Tu as gagné le tirage "${drawName}" sur ${interaction.guild.name} ! Récompense : $
{prize}`
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
 ephemeral: true
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
 ephemeral: true
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
 ephemeral: true
 });
 }
 if (hour < 0 || hour > 23) hour = 12;
 pendingCalendars.set(`${guildId}:${interaction.user.id}`, {
 scope,
 winnersPerDay,
 hour,
 channelId: channelOption ? channelOption.id : null,
 roleId: roleOption ? roleOption.id : null
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
 if (
 interaction.customId === "panel_register" ||
 interaction.customId === "panel_participate"
 ) {
 const isBlacklistedUser = state.blacklistUsers.has(interaction.user.id);
 let isBlacklistedRole = false;
 if (state.blacklistRoles.size > 0) {
 const member = await interaction.guild.members
 .fetch(interaction.user.id)
 .catch(() => null);
 if (member) {
 for (const roleId of state.blacklistRoles) {
 if (member.roles.cache.has(roleId)) {
 isBlacklistedRole = true;
 break;
 }
 }
 }
 }
 if (isBlacklistedUser || isBlacklistedRole) {
 return interaction.reply({
 content: "Tu es blacklisté, tu ne peux pas t'inscrire.",
 ephemeral: true
 });
 }
 state.players.add(interaction.user.id);
 return interaction.reply({
 content: "Tu es inscrit pour les tirages.",
 ephemeral: true
 });
 }
 if (interaction.customId.startsWith("vp_")) {
 const msg = interaction.message;
 const embed = msg.embeds[0];
 const { page, total } = getPageFromFooter(embed);
 let newPage = page;
 if (interaction.customId === "vp_first") newPage = 1;
 if (interaction.customId === "vp_prev") newPage = page - 1;
 if (interaction.customId === "vp_next") newPage = page + 1;
 if (interaction.customId === "vp_prev2") newPage = page - 2;
 if (interaction.customId === "vp_next2") newPage = page + 2;
 if (newPage < 1) newPage = 1;
 if (newPage > total) newPage = total;
 const pageData = buildPlayersPageEmbed(state, newPage);
 return interaction.update({
 embeds: [pageData.embed],
 components: pageData.components
 });
 }
 if (interaction.customId === "players_reset_ask") {
 const member = await interaction.guild.members
 .fetch(interaction.user.id)
 .catch(() => null);
 const isAdmin =
 member &&
 (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
 member.permissions.has(PermissionsBitField.Flags.ManageGuild));
 if (!isAdmin) {
 return interaction.reply({
 content:
 "Tu dois être administrateur pour reset la liste des joueurs.",
 ephemeral: true
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
 content:
 "Tu es sûr de vouloir reset la liste des joueurs inscrits ?",
 components: [row],
 ephemeral: true
 });
 }
 if (interaction.customId === "players_reset_confirm") {
 const member = await interaction.guild.members
 .fetch(interaction.user.id)
 .catch(() => null);
 const isAdmin =
 member &&
 (member.permissions.has(PermissionsBitField.Flags.Administrator) ||
 member.permissions.has(PermissionsBitField.Flags.ManageGuild));
 if (!isAdmin) {
 return interaction.reply({
 content:
 "Tu dois être administrateur pour reset la liste des joueurs.",
 ephemeral: true
 });
 }
 state.players.clear();
 return interaction.update({
 content: "Liste des joueurs inscrits réinitialisée.",
 components: []
 });
 }
 if (interaction.customId === "players_reset_cancel") {
 return interaction.update({
 content: "Reset annulé.",
 components: []
 });
 }
 if (interaction.customId === "players_save") {
 const playersArray = Array.from(state.players);
 const content =
 playersArray.length > 0
 ? playersArray.map((id, index) => `${index + 1}. ${id}`).join("\n")
 : "Aucun joueur inscrit.";
 const file = new AttachmentBuilder(Buffer.from(content, "utf-8"), {
 name: "joueurs.txt"
 });
 return interaction.reply({
 content: "Fichier des joueurs inscrit(s) :",
 files: [file],
 ephemeral: true
 });
 }
 }
 if (interaction.isModalSubmit()) {
 if (interaction.customId === "cal_avent_modal") {
 if (!interaction.inGuild()) {
 return interaction.reply({
 content: "Ce bot fonctionne uniquement dans un serveur.",
 ephemeral: true
 });
 }
 const guildId = interaction.guild.id;
 const key = `${guildId}:${interaction.user.id}`;
 const baseConfig = pendingCalendars.get(key);
 if (!baseConfig) {
 return interaction.reply({
 content: "Aucune configuration de calendrier en cours.",
 ephemeral: true
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
 ephemeral: true
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
 doneDays: new Set()
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
 ephemeral: true
 });
 await processAllCalendars(true, client);
 }
 }
});
const server = express();
server.all("/", (req, res) => {
 res.send("Bot online");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
 console.log("HTTP server actif sur le port " + PORT)
);
client.login(TOKEN);
