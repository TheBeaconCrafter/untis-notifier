import config from '../config.js';
import formatter from './formatter.js';

const { formatTimeUntis } = formatter;

// ─── Ping Target ─────────────────────────────

/**
 * Returns the Discord mention string based on config.
 */
function getPingMention() {
  return config.discord.pingTarget.mention || '';
}

// ─── Embed & Short Text Builders ──────────────────────────

function buildAbsenceShortText(absence, type) {
  let dateStr = absence.date || '?';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) dateStr = `${parts[2]}.${parts[1]}`;
  }
  const name = absence.studentName || 'Student';
  const time = `(${absence.startTime} - ${absence.endTime})`;
  
  if (type === 'new') return `New absence for ${name} on ${dateStr} ${time}.`;
  if (type === 'removed') return `Absence removed for ${name} on ${dateStr} ${time}.`;
  if (type === 'modified') return `Absence modified for ${name} on ${dateStr} ${time}.`;
  return '';
}

function buildAbsenceEmbed(absence, type = 'new') {
  const colors = { new: 0xffa500, removed: 0x2ecc71, modified: 0x3498db };
  const titles = {
    new: '⚠️ New Absence',
    removed: '✅ Absence Removed',
    modified: '⏪ Absence Modified',
  };

  return {
    title: titles[type] || '⚠️ Absence',
    color: colors[type] || 0xffa500,
    fields: [
      { name: 'Student', value: absence.studentName || 'Unknown', inline: true },
      { name: 'Reason', value: absence.reason || 'No reason', inline: true },
      { name: 'Date', value: absence.date || 'Unknown', inline: true },
      { name: 'Status', value: absence.isExcused || 'Unknown', inline: true },
      { name: 'Time', value: `${absence.startTime} – ${absence.endTime}`, inline: true },
      { name: 'Created By', value: absence.createdUser || 'Unknown', inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
}

function buildTimetableShortText(change) {
  let lessonDate;
  if (change.date) {
    const d = change.date.toString();
    lessonDate = `${d.slice(6, 8)}.${d.slice(4, 6)}`;
  } else {
    const today = new Date();
    lessonDate = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  const lessonStart = change.startTime ? formatTimeUntis(change.startTime) : '??:??';
  const lessonEnd = change.endTime ? formatTimeUntis(change.endTime) : '??:??';
  const timeStr = `(${lessonStart} - ${lessonEnd})`;

  if (change.type === 'new') {
    const name = change.lesson?.su?.[0]?.name || 'Unknown';
    const teacher = change.lesson?.te?.[0]?.name || 'Unknown';
    return `New lesson ${name} with ${teacher} added on ${lessonDate} ${timeStr}.`;
  }

  if (change.type === 'modified') {
    const newName = change.newLesson?.su?.[0]?.name || 'Unknown';
    const newTeacher = change.newLesson?.te?.[0]?.name || 'Unknown';
    const changesList = change.details?.join(', ') || 'modified';
    
    if (change.newLesson?.code === 'cancelled') {
      return `${newName} with ${newTeacher} on ${lessonDate} is cancelled ${timeStr}.`;
    }
    return `${newName} with ${newTeacher} on ${lessonDate} is modified: ${changesList} ${timeStr}.`;
  }

  if (change.type === 'removed') {
    const name = change.lesson?.su?.[0]?.name || 'Unknown';
    const teacher = change.lesson?.te?.[0]?.name || 'Unknown';
    return `${name} with ${teacher} on ${lessonDate} is removed ${timeStr}.`;
  }

  return '';
}

function buildTimetableEmbed(change) {
  let lessonDate;
  if (change.date) {
    const d = change.date.toString();
    lessonDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  } else {
    lessonDate = new Date().toISOString().split('T')[0];
  }

  const lessonStart = change.startTime ? formatTimeUntis(change.startTime) : '??:??';
  const lessonEnd = change.endTime ? formatTimeUntis(change.endTime) : '??:??';
  const timeStr = `${lessonStart} – ${lessonEnd}`;

  if (change.type === 'new') {
    const name = change.lesson?.su?.[0]?.longname || 'Unknown subject';
    const room = change.lesson?.ro?.[0]?.name || '?';
    const roomLong = change.lesson?.ro?.[0]?.longname || '';
    const teacher = change.lesson?.te?.[0]?.longname || 'Unknown';

    return {
      title: '🆕 New Lesson',
      color: 0x2ecc71,
      fields: [
        { name: 'Subject', value: name, inline: true },
        { name: 'Date', value: lessonDate, inline: true },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Room', value: `${room}${roomLong ? ` (${roomLong})` : ''}`, inline: true },
        { name: 'Teacher', value: teacher, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  if (change.type === 'modified') {
    const oldName = change.oldLesson?.su?.[0]?.longname || 'Unknown';
    const newName = change.newLesson?.su?.[0]?.longname || 'Unknown';
    const oldRoom = change.oldLesson?.ro?.[0]?.name || '?';
    const newRoom = change.newLesson?.ro?.[0]?.name || '?';
    const oldTeacher = change.oldLesson?.te?.[0]?.longname || 'Unknown';
    const newTeacher = change.newLesson?.te?.[0]?.longname || 'Unknown';

    return {
      title: '🔄 Lesson Updated',
      color: 0xf39c12,
      fields: [
        { name: 'Date', value: lessonDate, inline: true },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Changes', value: change.details?.join(', ') || 'Unknown changes', inline: false },
        { name: 'Old', value: `${oldName} in ${oldRoom} with ${oldTeacher}`, inline: true },
        { name: 'New', value: `${newName} in ${newRoom} with ${newTeacher}`, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  if (change.type === 'removed') {
    const name = change.lesson?.su?.[0]?.longname || 'Unknown subject';
    const room = change.lesson?.ro?.[0]?.name || '?';
    const teacher = change.lesson?.te?.[0]?.longname || 'Unknown';

    return {
      title: '❌ Lesson Removed',
      color: 0xe74c3c,
      fields: [
        { name: 'Subject', value: name, inline: true },
        { name: 'Date', value: lessonDate, inline: true },
        { name: 'Time', value: timeStr, inline: true },
        { name: 'Room', value: room, inline: true },
        { name: 'Teacher', value: teacher, inline: true },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  return null;
}

function buildHomeworkShortText(hw) {
  let formattedDueDate = '?';
  if (hw.dueDate instanceof Date) {
    formattedDueDate = `${String(hw.dueDate.getDate()).padStart(2, '0')}.${String(hw.dueDate.getMonth() + 1).padStart(2, '0')}`;
  } else if (hw.dueDate) {
    const hwDate = new Date(hw.dueDate);
    if (!isNaN(hwDate)) {
      formattedDueDate = `${String(hwDate.getDate()).padStart(2, '0')}.${String(hwDate.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return `New homework for ${hw.lessonId || 'subject'} due on ${formattedDueDate}.`;
}

function buildHomeworkEmbed(hw) {
  const formattedDueDate = hw.dueDate instanceof Date
    ? hw.dueDate.toLocaleDateString()
    : new Date(hw.dueDate).toLocaleDateString();

  return {
    title: '📃 New Homework',
    color: 0x9b59b6,
    fields: [
      { name: 'Subject ID', value: String(hw.lessonId || '?'), inline: true },
      { name: 'Due Date', value: formattedDueDate, inline: true },
      { name: 'Description', value: hw.text || 'No description', inline: false },
      ...(hw.remark ? [{ name: 'Remark', value: hw.remark, inline: false }] : []),
    ],
    timestamp: new Date().toISOString(),
  };
}

function buildExamShortText(exam) {
  const formattedStart = formatTimeUntis(exam.startTime);
  const formattedEnd = formatTimeUntis(exam.endTime);
  const day = String(exam.examDate % 100).padStart(2, '0');
  const month = String(Math.floor((exam.examDate % 10000) / 100)).padStart(2, '0');
  return `New exam ${exam.name || exam.subject || 'Unknown'} on ${day}.${month} (${formattedStart} - ${formattedEnd}).`;
}

function buildExamEmbed(exam) {
  const formattedStart = formatTimeUntis(exam.startTime);
  const formattedEnd = formatTimeUntis(exam.endTime);

  const year = Math.floor(exam.examDate / 10000);
  const month = Math.floor((exam.examDate % 10000) / 100) - 1;
  const day = exam.examDate % 100;
  const dateStr = new Date(year, month, day).toLocaleDateString();

  return {
    title: '📚 New Exam',
    color: 0xe74c3c,
    fields: [
      { name: 'Name', value: exam.name || 'Unknown', inline: true },
      { name: 'Subject', value: exam.subject || 'Unknown', inline: true },
      { name: 'Date', value: dateStr, inline: true },
      { name: 'Time', value: `${formattedStart} – ${formattedEnd}`, inline: true },
      ...(exam.rooms ? [{ name: 'Room(s)', value: exam.rooms.join(', '), inline: true }] : []),
      ...(exam.teachers ? [{ name: 'Teachers', value: exam.teachers.join(', '), inline: true }] : []),
    ],
    timestamp: new Date().toISOString(),
  };
}

// ─── Summary Builder ─────────────────────────

function buildSummaryLine(changes) {
  const parts = [];
  const counts = {
    timetable: 0,
    absence: 0,
    homework: 0,
    exam: 0,
  };

  for (const change of changes) {
    if (change._category) {
      counts[change._category] = (counts[change._category] || 0) + 1;
    }
  }

  if (counts.timetable > 0) parts.push(`${counts.timetable} timetable ${counts.timetable === 1 ? 'change' : 'changes'}`);
  if (counts.absence > 0) parts.push(`${counts.absence} ${counts.absence === 1 ? 'absence' : 'absences'}`);
  if (counts.homework > 0) parts.push(`${counts.homework} homework ${counts.homework === 1 ? 'assignment' : 'assignments'}`);
  if (counts.exam > 0) parts.push(`${counts.exam} new ${counts.exam === 1 ? 'exam' : 'exams'}`);

  const total = changes.length;
  return `📋 **${total} ${total === 1 ? 'change' : 'changes'} detected:** ${parts.join(', ')}`;
}

// ─── Batched Send ────────────────────────────

/**
 * Send a batched notification to Discord.
 * Each item in `changes` should have an `_embed` (Discord embed object) and `_category` string.
 *
 * Discord allows up to 10 embeds per webhook message.
 */
async function sendBatchedNotification(changes) {
  if (!changes || changes.length === 0) return;

  const webhookUrl = config.discord.webhookUrl;
  if (!webhookUrl) {
    console.error('[DISCORD] No webhook URL configured, skipping notification.');
    return;
  }

  const embeds = changes.map(c => c._embed).filter(Boolean);
  const mention = getPingMention();
  const summary = buildSummaryLine(changes);

  // Discord allows max 10 embeds per message
  const chunks = [];
  for (let i = 0; i < embeds.length; i += 10) {
    chunks.push(embeds.slice(i, i + 10));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkChanges = changes.slice(i * 10, (i + 1) * 10);
    const chunkEmbeds = chunks[i];
    const chunkTexts = chunkChanges.map(c => c._shortText).filter(Boolean).map(t => `• ${t}`);

    const payload = {
      embeds: chunkEmbeds,
    };

    let contentText = '';
    // Only include the mention and summary header in the first message chunk
    if (i === 0) {
      if (mention) contentText += `${mention} `;
      contentText += summary;
    }

    if (chunkTexts.length > 0) {
      if (contentText) contentText += '\n\n';
      contentText += chunkTexts.join('\n');
    }

    if (contentText) {
      payload.content = contentText;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DISCORD] Webhook error (${response.status}):`, errorText);
      } else {
        console.log(`[DISCORD] Batch ${i + 1}/${chunks.length} sent successfully.`);
      }

      // Rate limit: wait 500ms between messages if we have multiple batches
      if (chunks.length > 1 && i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      console.error('[DISCORD] Error sending webhook:', error);
    }
  }
}

// ─── Legacy-compatible individual send functions ───

/**
 * Convenience: build and tag changes for batching.
 * These are used by the scanner modules to prepare changes.
 */
function tagAbsenceChanges(absences, type = 'new') {
  return absences.map(a => ({
    _category: 'absence',
    _embed: buildAbsenceEmbed(a, type),
    _shortText: buildAbsenceShortText(a, type),
  }));
}

function tagTimetableChanges(changes) {
  return changes.map(c => ({
    ...c,
    _category: 'timetable',
    _embed: buildTimetableEmbed(c),
    _shortText: buildTimetableShortText(c),
  })).filter(c => c._embed !== null);
}

function tagHomeworkChanges(homeworkList) {
  return homeworkList.map(h => ({
    _category: 'homework',
    _embed: buildHomeworkEmbed(h),
    _shortText: buildHomeworkShortText(h),
  }));
}

function tagExamChanges(exams) {
  return exams.map(e => ({
    _category: 'exam',
    _embed: buildExamEmbed(e),
    _shortText: buildExamShortText(e),
  }));
}

export default {
  sendBatchedNotification,
  tagAbsenceChanges,
  tagTimetableChanges,
  tagHomeworkChanges,
  tagExamChanges,
  // Exported for testing
  buildAbsenceEmbed,
  buildTimetableEmbed,
  buildHomeworkEmbed,
  buildExamEmbed,
  buildSummaryLine,
  getPingMention,
};