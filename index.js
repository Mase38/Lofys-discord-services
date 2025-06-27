const { Client, GatewayIntentBits, Partials, Collection, Events, REST, Routes, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Persistent config
const configPath = './config.json';
function loadConfig() {
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({
    panelChannelId: "",
    categoryId: "",
    allowedRoles: [],
    feedbackChannelId: "",
    ticketLogChannelId: "",
    ratingAllowedRoleId: ""
  }, null, 2));
  return JSON.parse(fs.readFileSync(configPath));
}
function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}
const config = loadConfig();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

client.commands = new Collection();
client.buttons = new Collection();

// Slash Command Definitions
const commands = [
  new SlashCommandBuilder()
    .setName('setup_ticket_panel')
    .setDescription('Set up the ticket panel')
    .addChannelOption(opt => opt.setName('panel_channel').setDescription('Post channel').setRequired(true))
    .addChannelOption(opt => opt.setName('category').setDescription('Ticket category').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Staff role').setRequired(true)),

  new SlashCommandBuilder()
    .setName('set_feedback_channel')
    .setDescription('Set the feedback logging channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Feedback channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('set_ticket_log_channel')
    .setDescription('Set the ticket log channel')
    .addChannelOption(opt => opt.setName('channel').setDescription('Log channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('set_rating_role')
    .setDescription('Set who can use /rate')
    .addRoleOption(opt => opt.setName('role').setDescription('Allowed role').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rate the Lofy service')
    .addIntegerOption(opt => opt.setName('score').setDescription('Score 1–10').setRequired(true))
    .addStringOption(opt => opt.setName('feedback').setDescription('Feedback').setRequired(true))
].map(cmd => cmd.toJSON());

// Slash Command Handlers
const commandHandlers = {
  setup_ticket_panel: async interaction => {
    const panelChannel = interaction.options.getChannel('panel_channel');
    const category = interaction.options.getChannel('category');
    const role = interaction.options.getRole('role');

    config.panelChannelId = panelChannel.id;
    config.categoryId = category.id;
    config.allowedRoles = [role.id];
    saveConfig(config);

    const embed = new EmbedBuilder()
      .setTitle('📩 Hire Lofy')
      .setDescription('Click below to open a ticket.')
      .setColor(0x2C3E50);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket').setLabel('Hire Lofy').setStyle(ButtonStyle.Primary)
    );

    await panelChannel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Panel sent to ${panelChannel}`, ephemeral: true });
  },

  set_feedback_channel: async interaction => {
    config.feedbackChannelId = interaction.options.getChannel('channel').id;
    saveConfig(config);
    await interaction.reply({ content: '✅ Feedback channel set.', ephemeral: true });
  },

  set_ticket_log_channel: async interaction => {
    config.ticketLogChannelId = interaction.options.getChannel('channel').id;
    saveConfig(config);
    await interaction.reply({ content: '✅ Ticket log channel set.', ephemeral: true });
  },

  set_rating_role: async interaction => {
    config.ratingAllowedRoleId = interaction.options.getRole('role').id;
    saveConfig(config);
    await interaction.reply({ content: '✅ Rating role updated.', ephemeral: true });
  },

  rate: async interaction => {
    if (!interaction.member.roles.cache.has(config.ratingAllowedRoleId)) {
      return interaction.reply({ content: '🚫 You’re not allowed to rate.', ephemeral: true });
    }

    const score = interaction.options.getInteger('score');
    const feedback = interaction.options.getString('feedback');

    await interaction.reply({ content: '✅ Thanks for your rating!', ephemeral: true });

    const channel = await client.channels.fetch(config.feedbackChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('⭐ New Rating')
            .addFields(
              { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Score', value: `${score}/10`, inline: true },
              { name: 'Feedback', value: feedback }
            )
            .setColor(0x2C3E50)
            .setTimestamp()
        ]
      });
    }
  }
};

// Button Handlers
client.buttons.set('open_ticket', {
  execute: async interaction => {
    const existing = interaction.guild.channels.cache.find(c => c.topic === interaction.user.id && c.parentId === config.categoryId);
    if (existing) return interaction.reply({ content: '⚠️ You already have a ticket.', ephemeral: true });

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      topic: interaction.user.id,
      parent: config.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...config.allowedRoles.map(roleId => ({
          id: roleId,
          allow: [PermissionsBitField.Flags.ViewChannel]
        }))
      ]
    });

    const embed = new EmbedBuilder().setTitle('🎟️ Ticket Created').setDescription('A staff member will be with you shortly.').setColor(0x2C3E50);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('claim_ticket').setLabel('🎫 Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('close_ticket_button').setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: config.allowedRoles.map(r => `<@&${r}>`).join(' '),
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }
});

client.buttons.set('claim_ticket', {
  execute: async interaction => {
    const isStaff = config.allowedRoles.some(r => interaction.member.roles.cache.has(r));
    if (!isStaff) return interaction.reply({ content: '🚫 You’re not staff.', ephemeral: true });

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(`🎟️ Ticket claimed by <@${interaction.user.id}>`).setColor(0x2C3E50)]
    });
  }
});

client.buttons.set('close_ticket_button', {
  execute: async interaction => {
    const isStaff = config.allowedRoles.some(r => interaction.member.roles.cache.has(r));
    if (!isStaff) return interaction.reply({ content: '🚫 You’re not staff.', ephemeral: true });

    const userId = interaction.channel.topic;
    const user = await interaction.guild.members.fetch(userId).catch(() => null);

    if (user) {
      await user.send({
        embeds: [new EmbedBuilder().setTitle('📫 Ticket Closed').setDescription('Thanks for contacting Lofy!').setColor(0x2C3E50)]
      }).catch(() => null);
    }

    const logChannel = await client.channels.fetch(config.ticketLogChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('📁 Ticket Closed')
            .addFields(
              { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'User', value: `<@${userId}>`, inline: true },
              { name: 'Channel', value: interaction.channel.name }
            )
            .setColor(0x2C3E50)
            .setTimestamp()
        ]
      });
    }

    await interaction.reply({ content: '🔒 Closing ticket...', ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
  }
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers[interaction.commandName];
      if (handler) await handler(interaction);
    }

    if (interaction.isButton()) {
      const handler = client.buttons.get(interaction.customId);
      if (handler) await handler.execute(interaction);
    }
  } catch (err) {
    console.error('❌ Interaction error:', err);
    if (!interaction.replied) {
      interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
    }
  }
});

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Set custom status
  client.user.setPresence({
    activities: [{ name: '💼 View #hire-lofy to hire! 💼', type: 0 }],
    status: 'idle'
  });

  // Deploy slash commands to the guild
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands deployed.');
  } catch (err) {
    console.error('❌ Slash command deploy error:', err);
  }
});

client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Login failed:', err.message);
});
