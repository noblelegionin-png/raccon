import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { outreachService } from '../src/whatsapp/outreachService.js';
import { whatsAppService } from '../src/whatsapp/whatsappService.js';
import { buildWhatsAppChatContext, buildWhatsAppDirective } from '../src/whatsapp/whatsappPersona.js';
import { recordUserMessage, recordAssistantMessage, clearConversation } from '../src/conversation/manager.js';
import { scaleMaxAdapter } from '../src/provider/scaleMaxAdapter.js';
import { sandyStatusService } from '../src/whatsapp/sandyStatusService.js';

describe('🚀 Nero Labs — Intelligent Outbound Outreach & Prolonged Multi-Turn Dialogue Suite', () => {

  // -------------------------------------------------------------
  // Test 1: Phone Number Normalization & Sanitization
  // -------------------------------------------------------------
  test('Test 1: Normalizes diverse phone number formats (10-digit Indian, 0-prefix, +91, international)', () => {
    // 10-digit Indian numbers starting with 6-9 -> prefix with 91
    assert.strictEqual(outreachService.normalizePhoneNumber('8091785996'), '918091785996');
    assert.strictEqual(outreachService.normalizePhoneNumber('9876543210'), '919876543210');
    assert.strictEqual(outreachService.normalizePhoneNumber('+91 80917 85996'), '918091785996');
    assert.strictEqual(outreachService.normalizePhoneNumber('+91-98765-43210'), '919876543210');
    assert.strictEqual(outreachService.normalizePhoneNumber('08091785996'), '918091785996');
    assert.strictEqual(outreachService.normalizePhoneNumber('918091785996'), '918091785996');

    // International numbers
    assert.strictEqual(outreachService.normalizePhoneNumber('+1 (214) 293-8364'), '12142938364');
    assert.strictEqual(outreachService.normalizePhoneNumber('+44 7911 123456'), '447911123456');

    // Invalid / too short
    assert.strictEqual(outreachService.normalizePhoneNumber('12345'), null);
    assert.strictEqual(outreachService.normalizePhoneNumber(''), null);
  });

  // -------------------------------------------------------------
  // Test 2: Natural Language Outreach Command Parsing
  // -------------------------------------------------------------
  test('Test 2: Parses diverse natural language outreach commands (English, Hindi, Slash commands)', () => {
    // English standard "text <num> that <msg>"
    const cmd1 = outreachService.parseOutreachCommand('text 918091785996 that I will be 15 mins late for the meeting');
    assert.strictEqual(cmd1.isOutreach, true);
    assert.strictEqual(cmd1.targetQuery, '918091785996');
    assert.strictEqual(cmd1.directNumber, '918091785996');
    assert.match(cmd1.instruction, /15 mins late/i);

    // English with colon "message <num>: <msg>"
    const cmd2 = outreachService.parseOutreachCommand('message +91 80917 85996: please check your email for the design files');
    assert.strictEqual(cmd2.isOutreach, true);
    assert.strictEqual(cmd2.directNumber, '918091785996');
    assert.match(cmd2.instruction, /check your email/i);

    // English with "tell <name/num> to <msg>"
    const cmd3 = outreachService.parseOutreachCommand('tell 9876543210 to review the updated contract');
    assert.strictEqual(cmd3.isOutreach, true);
    assert.strictEqual(cmd3.directNumber, '919876543210');
    assert.match(cmd3.instruction, /review the updated contract/i);

    // Hindi / Hinglish "<num> ko text karo ki <msg>"
    const cmd4 = outreachService.parseOutreachCommand('9876543210 ko text karo ki kal meeting 4 baje hogi');
    assert.strictEqual(cmd4.isOutreach, true);
    assert.strictEqual(cmd4.directNumber, '919876543210');
    assert.match(cmd4.instruction, /kal meeting 4 baje hogi/i);

    // Slash command "/wa_send <num> <msg>"
    const cmd5 = outreachService.parseOutreachCommand('/wa_send 8091785996 hello from Sandy');
    assert.strictEqual(cmd5.isOutreach, true);
    assert.strictEqual(cmd5.directNumber, '918091785996');
    assert.match(cmd5.instruction, /hello from Sandy/i);

    // Non-outreach query should not trigger
    const nonCmd = outreachService.parseOutreachCommand('What is the weather today?');
    assert.strictEqual(nonCmd.isOutreach, false);
  });

  // -------------------------------------------------------------
  // Test 3: AI Message Composition ("Does it in its own AI way")
  // -------------------------------------------------------------
  test('Test 3: Composes intelligent, context-aware outreach in Nero AI voice', async () => {
    const originalChat = scaleMaxAdapter.createChatCompletion;

    try {
      // Mock Gemini 3.8 Flash response
      scaleMaxAdapter.createChatCompletion = async ({ messages }) => {
        return {
          text: `Hello! This is Nero reaching out on behalf of Sandy. Sandy wanted me to let you know that he's running about 15 minutes behind schedule for your upcoming meeting. He sends his apologies and will be joining shortly. Please feel free to reply directly to this message, and I will relay your response straight to him! ✨`,
          tokensUsed: 65,
        };
      };

      const aiMessage = await outreachService.composeAiOutreach({
        recipientName: 'Alex Partner',
        recipientNumber: '918091785996',
        instruction: 'that I will be 15 mins late for our meeting',
        relationship: 'Business Partner',
        senderTitle: 'Sandy',
      });

      assert.match(aiMessage, /Nero/i, 'Must introduce itself as Nero');
      assert.match(aiMessage, /Sandy/i, 'Must mention it is reaching out for Sandy');
      assert.match(aiMessage, /15 minutes behind/i, 'Must intelligently convey Sandy core message');
      assert.match(aiMessage, /reply directly/i, 'Must invite the recipient to reply');
      assert.ok(!aiMessage.startsWith('"') && !aiMessage.endsWith('"'), 'Must not simply wrap words in raw quotes');

    } finally {
      scaleMaxAdapter.createChatCompletion = originalChat;
    }
  });

  // -------------------------------------------------------------
  // Test 4: Dynamic Fallback when AI endpoint is offline
  // -------------------------------------------------------------
  test('Test 4: Generates high-quality dynamic fallback for English and Hinglish when offline', async () => {
    // English dynamic fallback
    const engFallback = outreachService._generateDynamicFallback({
      recipientName: 'Rohan',
      instruction: 'please confirm if we are meeting at 5 PM',
      isHindiOrHinglish: false,
      senderTitle: 'Sandy',
    });
    assert.match(engFallback, /Nero/i);
    assert.match(engFallback, /Sandy/i);
    assert.match(engFallback, /please confirm if we are meeting at 5 PM/i);
    assert.match(engFallback, /reply directly/i);

    // Hinglish dynamic fallback
    const hinFallback = outreachService._generateDynamicFallback({
      recipientName: 'Rahul',
      instruction: 'kal subah 10 baje call karna',
      isHindiOrHinglish: true,
      senderTitle: 'Sandy',
    });
    assert.match(hinFallback, /Namaste/i);
    assert.match(hinFallback, /Nero/i);
    assert.match(hinFallback, /Sandy/i);
    assert.match(hinFallback, /kal subah 10 baje call karna/i);
    assert.match(hinFallback, /direct reply/i);
  });

  // -------------------------------------------------------------
  // Test 5: End-to-End AI Outreach Dispatch via WhatsApp Service
  // -------------------------------------------------------------
  test('Test 5: Full outreach dispatch delivers AI message to target and confirms to Sandy', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    const sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      const sent = {
        jid,
        text: content.text || '',
        quoted: options?.quoted,
        key: { id: `m_${Date.now()}` },
      };
      sentMessages.push(sent);
      return sent;
    };

    scaleMaxAdapter.createChatCompletion = async ({ messages }) => {
      return {
        text: `Hi there! Nero here on behalf of Sandy. Sandy asked me to check in with you to see if you received the updated project files sent earlier today. Feel free to reply right here! ✨`,
        tokensUsed: 50,
      };
    };

    try {
      const myPhone = '919317741936';
      const targetPhone = '8091785996';
      const prompt = `text ${targetPhone} ask if they received the updated project files`;

      const msg = {
        key: { id: `owner_cmd_${Date.now()}`, remoteJid: `${myPhone}@s.whatsapp.net`, fromMe: true },
        message: { conversation: prompt },
      };

      const result = await outreachService.handleOutreachRequest({
        whatsAppService,
        remoteJid: `${myPhone}@s.whatsapp.net`,
        msg,
        promptText: prompt,
        senderNumber: myPhone,
        senderName: 'Sandy',
      });

      assert.strictEqual(result.handled, true, 'Outreach request must be handled');
      assert.strictEqual(result.success, true, 'Outreach must succeed');
      assert.strictEqual(sentMessages.length, 2, 'Must send message to recipient AND confirmation to Sandy');

      // 1. Message to recipient
      const recipientMsg = sentMessages.find(m => m.jid === '918091785996@s.whatsapp.net');
      assert.ok(recipientMsg, 'Must deliver message to normalized recipient JID');
      assert.match(recipientMsg.text, /Nero/i);
      assert.match(recipientMsg.text, /Sandy/i);
      assert.match(recipientMsg.text, /project files/i);

      // 2. Confirmation to Sandy
      const ownerAck = sentMessages.find(m => m.jid === `${myPhone}@s.whatsapp.net`);
      assert.ok(ownerAck, 'Must deliver confirmation report back to Sandy');
      assert.match(ownerAck.text, /AI OUTREACH DISPATCHED/i);
      assert.match(ownerAck.text, /918091785996/);
      assert.match(ownerAck.text, /project files/i);

    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
    }
  });

  // -------------------------------------------------------------
  // Test 6: Prolonged Conversation Context Window & Memory
  // -------------------------------------------------------------
  test('Test 6: Extended chat directive and 30-message history window for prolonged conversations', () => {
    const testChatId = `wa_test_prolonged_${Date.now()}`;
    clearConversation(testChatId);

    // Simulate a long multi-turn dialogue (10 turns = 20 messages)
    for (let i = 1; i <= 10; i++) {
      recordUserMessage(testChatId, `User turn ${i}: Discussing topic aspect ${i}`);
      recordAssistantMessage(testChatId, `Assistant response ${i}: Explaining details about aspect ${i}.`, 40, 'gemini-3.5-flash-lite');
    }

    const { messages } = buildWhatsAppChatContext({
      chatId: testChatId,
      promptText: 'User turn 11: What do you think about the whole plan so far?',
      senderNumber: '919876500099',
      senderName: 'David Collaborator',
      isSandy: false,
    });

    // Check system directive contains extended conversation instructions
    const systemPrompt = messages[0].content;
    assert.match(systemPrompt, /EXTENDED & PROLONGED CONVERSATION INTELLIGENCE/i, 'Directive must instruct Nero on long chats');
    assert.match(systemPrompt, /Zero Repetitive Disclaimers/i, 'Directive must prevent repeating Sandy availability on every turn');

    // Context should contain all 20 previous messages plus system and current user message
    assert.ok(messages.length >= 21, `Messages array must preserve long multi-turn history (found ${messages.length})`);

    // Verify early messages are preserved in context
    const hasTurn1 = messages.some(m => typeof m.content === 'string' && m.content.includes('aspect 1'));
    assert.ok(hasTurn1, 'Early turns must be preserved in context window');

    clearConversation(testChatId);
  });

  // -------------------------------------------------------------
  // Test 7: Multi-Turn Conversation Reply Length & Natural Continuity
  // -------------------------------------------------------------
  test('Test 7: Contact chatting across multiple turns receives substantive responses without artificial caps', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    const contactJid = '919876500088@s.whatsapp.net';
    const contactNum = '919876500088';
    clearConversation(`wa_${contactJid}`);

    let sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      const sent = { jid, text: content.text || '', quoted: options?.quoted };
      sentMessages.push(sent);
      return sent;
    };

    // Mock Gemini providing a detailed, multi-sentence conversational answer
    scaleMaxAdapter.createChatCompletion = async ({ maxTokens }) => {
      assert.ok(maxTokens >= 500, `maxTokens must be at least 500 to allow substantive replies (got ${maxTokens})`);
      return {
        text: `Sandy is currently at the fitness gym and will be wrapping up in about 45 minutes. Regarding your question about the server migration: we have scheduled the database failover for midnight to minimize downtime. The SSL certificates and reverse proxies are already verified. I will let Sandy know that you checked in, and he will call you right after his workout!`,
        tokensUsed: 80,
      };
    };

    try {
      const incomingMsg = {
        key: { id: `msg_contact_${Date.now()}`, remoteJid: contactJid, fromMe: false },
        message: { conversation: 'Hey Nero, could you give me an update on Sandy and how the migration plan is going?' },
      };

      await whatsAppService.handleIncomingMessage(incomingMsg);

      const contactReply = sentMessages.find(m => m.jid === contactJid && m.text && !m.poll);
      assert.ok(contactReply, 'Must reply conversationally to contact');
      const reply = contactReply.text;
      assert.match(reply, /server migration/i, 'Must contain substantive conversation details');
      assert.match(reply, /Sandy is currently at the fitness gym/i);

      // Verify the response was not truncated by an artificial 50-word cap
      const wordCount = reply.split(/\s+/).filter(Boolean).length;
      assert.ok(wordCount > 40, `Prolonged conversation reply must allow detailed responses (word count: ${wordCount})`);

    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
      clearConversation(`wa_${contactJid}`);
    }
  });

  // -------------------------------------------------------------
  // Test 8: Sandy's Exact Command & Multi-Device LID Authorization
  // -------------------------------------------------------------
  test('Test 8: Recognizes Studio LID (214293836493051) and linked LID as Owner Sandy, dispatches outreach to Minecraft contact', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    // Verify LID owner authorization
    assert.strictEqual(sandyStatusService.isOwnerNumber('214293836493051'), true, 'Studio LID must be recognized as Sandy');
    assert.strictEqual(sandyStatusService.isOwnerNumber('105107177869409'), false, 'External contact LID must NOT be recognized as Owner Sandy');

    const sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      const sent = { jid, text: content.text || '', quoted: options?.quoted };
      sentMessages.push(sent);
      return sent;
    };

    scaleMaxAdapter.createChatCompletion = async ({ messages }) => {
      return {
        text: `Hey there! Nero here reaching out for Sandy. 🎮 Sandy wanted to invite you to jump on and play in the Minecraft Realm right now! Feel free to reply right here when you're jumping in! ✨`,
        tokensUsed: 45,
      };
    };

    try {
      const ownerLidJid = '214293836493051@lid';
      const prompt = 'Text +91 80918 98350 that comes to play in Minecraft realme ';

      const incomingMsg = {
        key: { id: `cmd_sandy_${Date.now()}`, remoteJid: ownerLidJid, fromMe: false },
        message: { conversation: prompt },
      };

      await whatsAppService.handleIncomingMessage(incomingMsg);

      assert.strictEqual(sentMessages.length, 2, 'Must send message to Minecraft friend AND confirmation report to Sandy');

      // 1. Contact message
      const friendMsg = sentMessages.find(m => m.jid === '918091898350@s.whatsapp.net');
      assert.ok(friendMsg, 'Must dispatch message to Minecraft friend +91 80918 98350');
      assert.match(friendMsg.text, /Minecraft Realm/i);
      assert.match(friendMsg.text, /Sandy/i);

      // 2. Sandy confirmation
      const sandyAck = sentMessages.find(m => m.jid === ownerLidJid);
      assert.ok(sandyAck, 'Must return confirmation report back to Sandy at 214293836493051@lid');
      assert.match(sandyAck.text, /AI OUTREACH DISPATCHED/i);
      assert.match(sandyAck.text, /918091898350/);

    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
    }
  });

  // -------------------------------------------------------------
  // Test 9: Conversational Prefixes & Varied Outreach Action Verbs
  // -------------------------------------------------------------
  test('Test 9: Parses conversational prefixes, varied verbs (ask, ping, dm, tell) and cleans instruction', () => {
    // Prefix "Yo nero text..."
    const c1 = outreachService.parseOutreachCommand('Yo nero text +91 80918 98350 that comes to play in Minecraft realme');
    assert.strictEqual(c1.isOutreach, true);
    assert.strictEqual(c1.directNumber, '918091898350');
    assert.strictEqual(c1.instruction, 'comes to play in Minecraft realme');

    // "ask <num> if..."
    const c2 = outreachService.parseOutreachCommand('ask +91 80918 98350 if he is free to play');
    assert.strictEqual(c2.isOutreach, true);
    assert.strictEqual(c2.directNumber, '918091898350');
    assert.strictEqual(c2.instruction, 'he is free to play');

    // "send a whatsapp to <num> saying..."
    const c3 = outreachService.parseOutreachCommand('send a whatsapp to 8091898350 saying that dinner is ready');
    assert.strictEqual(c3.isOutreach, true);
    assert.strictEqual(c3.directNumber, '918091898350');
    assert.strictEqual(c3.instruction, 'dinner is ready');

    // "dm <num> we are waiting..."
    const c4 = outreachService.parseOutreachCommand('dm 8091898350 we are waiting for you in discord');
    assert.strictEqual(c4.isOutreach, true);
    assert.strictEqual(c4.directNumber, '918091898350');
    assert.strictEqual(c4.instruction, 'we are waiting for you in discord');
  });

  // -------------------------------------------------------------
  // Test 10: Outreach Recipient Reply Notifies Sandy in Real-Time
  // -------------------------------------------------------------
  test('Test 10: Recipient reply to outreach triggers conversation reply AND instant alert to Sandy', async () => {
    const originalSafeSend = whatsAppService.safeSendMessage;
    const originalChat = scaleMaxAdapter.createChatCompletion;

    const friendNum = '918091898350';
    const friendJid = `${friendNum}@s.whatsapp.net`;
    clearConversation(`wa_${friendJid}`);

    // Register active outreach
    outreachService.registerDispatchedOutreach({
      targetNumber: friendNum,
      targetJid: friendJid,
      instruction: 'comes to play in Minecraft realme',
      sentMessage: 'Hey! Sandy invited you to Minecraft Realm!',
      targetName: 'Minecraft Friend',
    });

    const sentMessages = [];
    whatsAppService.safeSendMessage = async (jid, content, options) => {
      const sent = { jid, text: content.text || '', quoted: options?.quoted };
      sentMessages.push(sent);
      return sent;
    };

    scaleMaxAdapter.createChatCompletion = async () => {
      return {
        text: `Awesome! I've let Sandy know you are hopping on right now. See you in the realm! ⛏️`,
        tokensUsed: 30,
      };
    };

    try {
      const incomingFriendReply = {
        key: { id: `friend_reply_${Date.now()}`, remoteJid: friendJid, fromMe: false },
        message: { conversation: "Joining the realm in 2 mins, what is the realm code?" },
      };

      await whatsAppService.handleIncomingMessage(incomingFriendReply);

      // 1. Reply sent to friend
      const friendReply = sentMessages.find(m => m.jid === friendJid && m.text.includes('realm'));
      assert.ok(friendReply, 'Must hold conversation and reply to friend');
      assert.match(friendReply.text, /Sandy know you are hopping on/i);

      // 2. Alert sent to Sandy
      const sandyAlert = sentMessages.find(m => m.text && m.text.includes('OUTREACH REPLY RECEIVED'));
      assert.ok(sandyAlert, 'Must dispatch outreach reply alert to Sandy');
      assert.match(sandyAlert.text, /Minecraft Friend/i);
      assert.match(sandyAlert.text, /Joining the realm in 2 mins/i);
      assert.match(sandyAlert.text, /Nero's Conversational Reply/i);

    } finally {
      whatsAppService.safeSendMessage = originalSafeSend;
      scaleMaxAdapter.createChatCompletion = originalChat;
      clearConversation(`wa_${friendJid}`);
    }
  });

});
