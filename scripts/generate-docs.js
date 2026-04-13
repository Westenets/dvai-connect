const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, BorderStyle,
  WidthType, ShadingType, PageNumber, ExternalHyperlink } = require('docx');

const T = '00A8A8', D = '0F172A', D2 = '1E293B', LT = 'E6F7F7', LG = 'F1F5F9', MG = '64748B', W = 'FFFFFF';
const PW = 12240, PH = 15840, M = 1080, CW = PW - M * 2;
const nb = { style: BorderStyle.NONE, size: 0 };
const nbs = { top: nb, bottom: nb, left: nb, right: nb };

function sp(p = 200) { return new Paragraph({ spacing: { before: p, after: 0 }, children: [] }); }
function td() { return new Paragraph({ spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: T, space: 1 } }, children: [] }); }
function sh(t) { return new Paragraph({ spacing: { before: 100, after: 200 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 40, bold: true, color: D })] }); }
function sub(t) { return new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 28, bold: true, color: D2 })] }); }
function bt(t) { return new Paragraph({ spacing: { before: 80, after: 80, line: 320 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 21, color: '334155' })] }); }

function ip(p) {
  return new Paragraph({ spacing: { before: 200, after: 200 }, alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.DASHED, size: 2, color: T, space: 8 }, bottom: { style: BorderStyle.DASHED, size: 2, color: T, space: 8 }, left: { style: BorderStyle.DASHED, size: 2, color: T, space: 8 }, right: { style: BorderStyle.DASHED, size: 2, color: T, space: 8 } },
    children: [new TextRun({ text: '[IMAGE] ' + p, font: 'Segoe UI', size: 18, italics: true, color: T })] });
}

function cb(t) {
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: { style: BorderStyle.SINGLE, size: 1, color: T }, bottom: { style: BorderStyle.SINGLE, size: 1, color: T }, left: { style: BorderStyle.SINGLE, size: 8, color: T }, right: { style: BorderStyle.SINGLE, size: 1, color: T } },
      shading: { fill: LT, type: ShadingType.CLEAR }, margins: { top: 160, bottom: 160, left: 240, right: 240 }, width: { size: CW, type: WidthType.DXA },
      children: [new Paragraph({ spacing: { line: 320 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 20, color: '0F766E', italics: true })] })]
    })] })] });
}

function pb(ti, de, bg) {
  return new TableCell({ borders: nbs, shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 200, bottom: 200, left: 200, right: 200 }, width: { size: Math.floor(CW / 3), type: WidthType.DXA },
    children: [
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: ti, font: 'Segoe UI', size: 22, bold: true, color: bg === D ? W : D })] }),
      new Paragraph({ spacing: { line: 300 }, children: [new TextRun({ text: de, font: 'Segoe UI', size: 18, color: bg === D ? 'CBD5E1' : '475569' })] }),
    ] });
}

function fr(t1, d1, t2, d2) {
  const h = Math.floor(CW / 2);
  function c(t, d) {
    return new TableCell({ borders: nbs, margins: { top: 120, bottom: 120, left: 160, right: 160 }, width: { size: h, type: WidthType.DXA },
      shading: { fill: LG, type: ShadingType.CLEAR },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 22, bold: true, color: T })] }),
        new Paragraph({ spacing: { line: 300 }, children: [new TextRun({ text: d, font: 'Segoe UI', size: 19, color: '475569' })] }),
      ] });
  }
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [h, h], rows: [new TableRow({ children: [c(t1, d1), c(t2, d2)] })] });
}

function af(ti, de) {
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [CW],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: nb, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' }, left: { style: BorderStyle.SINGLE, size: 6, color: T }, right: nb },
      margins: { top: 120, bottom: 120, left: 200, right: 160 }, width: { size: CW, type: WidthType.DXA },
      children: [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: ti, font: 'Segoe UI', size: 22, bold: true, color: D })] }),
        new Paragraph({ spacing: { line: 300 }, children: [new TextRun({ text: de, font: 'Segoe UI', size: 19, color: '475569' })] }),
      ] })] })] });
}

function ac(ti, de, fi) {
  return new TableCell({ borders: nbs, shading: { fill: fi, type: ShadingType.CLEAR },
    margins: { top: 200, bottom: 200, left: 200, right: 200 }, width: { size: Math.floor(CW / 2), type: WidthType.DXA },
    children: [
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: ti, font: 'Segoe UI', size: 22, bold: true, color: D })] }),
      new Paragraph({ spacing: { line: 300 }, children: [new TextRun({ text: de, font: 'Segoe UI', size: 18, color: '475569' })] }),
    ] });
}

function hdr(t) { return { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: T, space: 4 } }, children: [new TextRun({ text: 'DVAI Meet \u2014 ' + t, font: 'Segoe UI', size: 16, color: MG })] })] }) }; }
function ftr() { return { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Deep Voice AI Limited  |  Page ', font: 'Segoe UI', size: 16, color: MG }), new TextRun({ children: [PageNumber.CURRENT], font: 'Segoe UI', size: 16, color: MG })] })] }) }; }
function bl(t) { return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { line: 320 }, children: [new TextRun({ text: t, font: 'Segoe UI', size: 21, color: '334155' })] }); }

const pg = { page: { size: { width: PW, height: PH }, margin: { top: 1080, right: M, bottom: 1080, left: M } } };

const doc = new Document({
  styles: { default: { document: { run: { font: 'Segoe UI', size: 22 } } } },
  numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
  sections: [
    // COVER
    { properties: { page: { size: { width: PW, height: PH }, margin: { top: 2880, right: M, bottom: 1440, left: M } } },
      children: [
        sp(2000),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'DVAI Meet', font: 'Segoe UI', size: 72, bold: true, color: D })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: T, space: 12 } }, children: [new TextRun({ text: 'Secure, Intelligent Video Conferencing', font: 'Segoe UI', size: 28, color: T })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: 'Powered by On-Device AI', font: 'Segoe UI', size: 24, color: MG })] }),
        sp(400),
        ip('Generate a futuristic, minimal hero image of a secure video conference with a glowing shield icon and subtle AI neural network patterns in teal (#00A8A8) and dark navy. Clean, enterprise-grade aesthetic. 1920x1080'),
        sp(1200),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Deep Voice AI Limited', font: 'Segoe UI', size: 24, bold: true, color: D })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new TextRun({ text: 'Confidential Product Documentation \u2014 2025', font: 'Segoe UI', size: 18, color: MG })] }),
      ] },
    // EXECUTIVE SUMMARY
    { properties: pg, headers: hdr('Product Overview'), footers: ftr(),
      children: [
        sh('Why DVAI Meet?'), td(),
        bt('DVAI Meet is a next-generation video conferencing platform built from the ground up for organizations that refuse to compromise on privacy, security, or intelligence. Every call is protected by military-grade end-to-end encryption. Every meeting transcript, summary, and action item is generated entirely on-device \u2014 your data never leaves your hardware.'),
        sp(40),
        bt('Whether you are a Fortune 500 company, a government agency, or a healthcare provider, DVAI Meet gives you the collaboration tools you need with zero cloud dependency for sensitive data.'),
        sp(200),
        new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [Math.floor(CW / 3), Math.floor(CW / 3), Math.floor(CW / 3)],
          rows: [new TableRow({ children: [
            pb('Zero-Trust Security', 'Every byte of audio, video, and data is encrypted end-to-end using AES-GCM encryption. Not even our servers can see your content.', D),
            pb('On-Device AI', 'Meeting summaries, action items, and intelligent search powered by Gemma 4 running entirely in your browser via WebGPU. No API calls. No cloud processing.', LT),
            pb('Enterprise Ready', 'Waiting rooms, admin controls, recording management, role-based permissions, and full audit trails. Built for regulated industries.', LG),
          ] })] }),
      ] },
    // E2EE
    { properties: pg, headers: hdr('Security'), footers: ftr(),
      children: [
        sh('Military-Grade Encryption, Built In'), td(),
        ip('Generate a clean infographic showing E2EE flow: Participant A device -> encrypted stream (lock icon) -> DVAI servers (crossed out eye, cannot read) -> encrypted stream -> Participant B device. Teal and dark theme. 1200x600'),
        bt('DVAI Meet uses AES-GCM (Advanced Encryption Standard in Galois/Counter Mode) to encrypt all audio, video, screen shares, chat messages, and data streams in real-time. Encryption keys are generated locally on each participant\'s device and are never transmitted to or stored on DVAI servers.'),
        sp(100), sub('How It Works'),
        bt('When you create or join an encrypted meeting, a unique cryptographic passphrase is generated and shared exclusively through the meeting link\'s URL fragment (the part after the # symbol). URL fragments are never sent to servers by web browsers \u2014 they stay entirely on-device. This passphrase is used to derive AES-GCM encryption keys locally using the Web Crypto API. Every media frame is individually encrypted before transmission.'),
        sp(100), sub('What Is Protected'),
        bl('Audio and video streams from all participants'),
        bl('Screen share content'),
        bl('Chat messages and file transfers'),
        bl('Real-time data channels (reactions, hand raises, transcription)'),
        sp(100), sub('What This Means For You'),
        bt('Even if network traffic is intercepted, recorded, or subpoenaed from our infrastructure, the content is mathematically unreadable without the passphrase \u2014 which only meeting participants possess.'),
        sp(100),
        cb('DVAI Meet servers act purely as encrypted relay nodes. We have zero access to your meeting content. This is not a policy \u2014 it is a mathematical guarantee.'),
      ] },
    // ON-DEVICE AI
    { properties: pg, headers: hdr('AI Intelligence'), footers: ftr(),
      children: [
        sh('AI That Never Leaves Your Device'), td(),
        ip('Generate an illustration of a laptop/browser with a glowing AI brain inside, arrows pointing to: Summary document, Action items checklist, Q&A list. No cloud icons. Teal glow on dark background. 1200x600'),
        bt('DVAI Meet includes a full AI intelligence suite that runs entirely within your web browser using WebGPU acceleration. Powered by Google\'s Gemma 4 language model (optimized for edge deployment), the AI processes your meeting transcripts locally to extract actionable insights \u2014 without sending a single word to any external server.'),
        sp(200),
        fr('Automatic Meeting Summaries', 'After your meeting ends, DVAI Meet automatically generates a comprehensive summary capturing all discussion topics, decisions made, and key takeaways.', 'Action Item Extraction', 'The AI identifies tasks, assignments, deadlines, and responsibilities mentioned during the meeting and presents them as a structured checklist.'),
        sp(100),
        fr('Unanswered Questions', 'Identifies questions that were raised but not resolved during the meeting, ensuring nothing falls through the cracks.', 'Intelligent Meeting Search', 'Ask natural language questions about any past meeting. The AI retrieves relevant transcript excerpts and generates accurate, context-grounded answers.'),
        sp(200),
        cb('All AI processing uses Google\'s Gemma 4 model running via WebGPU in your browser. Zero API calls. Zero cloud processing. Your meeting data stays on your hardware.'),
      ] },
    // LIVE FEATURES
    { properties: pg, headers: hdr('Features'), footers: ftr(),
      children: [
        sh('Everything You Need in a Meeting'), td(),
        ip('Generate a clean screenshot mockup of a video conference grid with 4 participants, control bar at bottom. Modern dark UI with teal accents. 1400x800'),
        sp(100),
        fr('HD Video & Audio', 'Crystal-clear 1080p video and high-fidelity audio with adaptive bitrate that adjusts to your network conditions in real-time.', 'Screen Sharing', 'Share your entire screen, a specific window, or a browser tab with one click. Perfect for presentations and demos.'),
        sp(80),
        fr('Smart Recording', 'Record meetings with a single click. Recordings are processed and stored securely, accessible from your personal recording library.', 'Live Transcription', 'Real-time captions powered by on-device speech recognition. Adjustable font sizes from small to extra-large for accessibility.'),
        sp(80),
        fr('In-Meeting Chat', 'Rich messaging with text and file sharing. Files are securely uploaded and shared via encrypted links. Chat history is preserved for recorded meetings.', 'Emoji Reactions', 'Express yourself without interrupting. Send emoji reactions that appear on your video tile for all participants to see.'),
        sp(80),
        fr('Hand Raise', 'Raise your hand to get the speaker\'s attention without unmuting. Visual indicators appear on your tile and in the participants panel.', 'Picture-in-Picture', 'Pop the meeting into a floating mini-window while you work in other applications. Full camera and mic controls stay accessible.'),
      ] },
    // ADMIN
    { properties: pg, headers: hdr('Administration'), footers: ftr(),
      children: [
        sh('Enterprise-Grade Meeting Controls'), td(), sp(100),
        af('Waiting Room', 'Every non-admin participant enters a secure waiting room. Admins review and admit each person individually, preventing unauthorized access to sensitive meetings.'), sp(80),
        af('Role-Based Permissions', 'Meeting creators and designated admins have full control: admit or deny participants, mute individuals, remove disruptive attendees, and pin important speakers.'), sp(80),
        af('Recording Permissions', 'Only admins or the person who initiated a recording can stop it, preventing accidental or unauthorized recording interruptions.'), sp(80),
        af('Secure Meeting Links', 'Meeting codes use cryptographically random identifiers. E2EE passphrases are embedded in URL fragments that never reach the server.'), sp(80),
        af('DVAI Meeting Agent', 'Deploy AI-powered agents directly into your meetings for real-time assistance, note-taking, or automated workflows \u2014 all operating under the same E2EE protection as human participants.'), sp(80),
        af('Invite System', 'Invite participants via email directly from the meeting interface. Invitations include secure meeting links and one-click join functionality.'),
      ] },
    // RECORDINGS
    { properties: pg, headers: hdr('Recordings'), footers: ftr(),
      children: [
        sh('Your Meeting, Your Library'), td(),
        ip('Generate a clean UI mockup of a recording library dashboard showing 6 recording cards in a grid. Dark theme with teal accents. 1400x800'),
        bt('Every recorded meeting is automatically saved to your personal recording library. Browse, search, share, and revisit any meeting with full AI-powered insights.'),
        sp(200),
        af('Recording Library', 'All your recordings in one place. Search by name, filter by date range, and sort by latest, oldest, or name. Switch between tile and table views.'), sp(80),
        af('Video Playback', 'Full video player with play/pause, seek, volume control, playback speed (0.5x to 2x), and fullscreen mode.'), sp(80),
        af('AI Insights on Recordings', 'When you open a recording, the AI pipeline automatically processes the transcript and generates summaries, action items, and questions \u2014 all running locally on your device.'), sp(80),
        af('Ask About This Meeting', 'Use the intelligent search to ask natural language questions about any recorded meeting. Get AI-generated answers grounded in the actual transcript with source citations.'), sp(80),
        af('Share Recordings', 'Share recording links via email, Telegram, WhatsApp, X (Twitter), or LinkedIn with a single click.'),
      ] },
    // ARCHITECTURE
    { properties: pg, headers: hdr('Architecture'), footers: ftr(),
      children: [
        sh('Built for Privacy by Design'), td(),
        ip('Generate a clean architecture diagram: User Device (Browser) containing WebGPU AI Engine, IndexedDB Local Storage, E2EE Encryption Layer. Arrows to DVAI Relay Servers (encrypted only). Enterprise infographic style. 1400x700'),
        sp(100),
        af('Local-First Architecture', 'Transcripts, chat messages, AI insights, and embeddings are stored in your browser\'s local database. They never leave your device unless you explicitly share them.'), sp(80),
        af('On-Device Inference', 'The Gemma 4 language model and MiniLM embedding model run entirely via WebGPU in your browser. No data is sent to any AI provider.'), sp(80),
        af('Encrypted Relay', 'DVAI servers relay encrypted media streams between participants. We cannot decrypt, inspect, or store your meeting content.'), sp(80),
        af('Secure Storage', 'User accounts and recording metadata are managed through encrypted, SOC2-compliant infrastructure. Recording video files are stored in encrypted object storage.'), sp(80),
        af('Intelligent Chat Lifecycle', 'Chat messages are only preserved for recorded meetings. If a meeting is not recorded, all chat data and uploaded files are automatically purged when the meeting ends.'),
      ] },
    // USE CASES
    { properties: pg, headers: hdr('Use Cases'), footers: ftr(),
      children: [
        sh('Built for Organizations That Demand Privacy'), td(), sp(200),
        new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [Math.floor(CW / 2), Math.floor(CW / 2)],
          rows: [
            new TableRow({ children: [ac('Government & Defense', 'Classified briefings, inter-agency coordination, and secure policy discussions. E2EE ensures content sovereignty \u2014 your data never leaves participant devices in readable form.', LT), ac('Healthcare & HIPAA', 'Patient consultations, clinical case reviews, and care coordination meetings. On-device AI processing means PHI is never exposed to third-party servers.', LG)] }),
            new TableRow({ children: [ac('Legal & Financial', 'Attorney-client privilege, M&A discussions, and board meetings. Mathematical encryption guarantees that privileged communications remain private.', LG), ac('Enterprise & IP Protection', 'Product roadmap discussions, R&D reviews, and strategic planning. Keep your intellectual property safe with zero-cloud AI and end-to-end encryption.', LT)] }),
          ] }),
      ] },
    // BACK COVER
    { properties: { page: { size: { width: PW, height: PH }, margin: { top: 3600, right: M, bottom: 1440, left: M } } },
      children: [
        sp(2000),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'Deep Voice AI Limited', font: 'Segoe UI', size: 48, bold: true, color: D })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: T, space: 12 } }, children: [] }),
        sp(200),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Secure communication. Intelligent collaboration. Zero compromise.', font: 'Segoe UI', size: 24, italics: true, color: T })] }),
        sp(400),
        ip('Generate a minimal, elegant graphic with shield+AI icon in teal. Dark background. 600x300'),
        sp(400),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new ExternalHyperlink({ children: [new TextRun({ text: 'deepvoiceai.co', font: 'Segoe UI', size: 22, color: T, underline: {} })], link: 'https://deepvoiceai.co' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'hello@deepvoiceai.co', font: 'Segoe UI', size: 20, color: MG })] }),
        sp(1200),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Copyright 2025 Deep Voice AI Limited. All rights reserved.', font: 'Segoe UI', size: 16, color: MG })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: 'DVAI Meet, DVAI Edge, and the DVAI logo are trademarks of Deep Voice AI Limited.', font: 'Segoe UI', size: 14, color: MG })] }),
      ] },
  ],
});

Packer.toBuffer(doc).then(buf => {
  const outPath = 'D:/Docs/Personal/Projects/Node.JS/Projects/meet/DVAI-Meet-Product-Documentation.docx';
  fs.writeFileSync(outPath, buf);
  console.log('DONE: ' + outPath);
});
