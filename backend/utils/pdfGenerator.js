const PDFDocument = require('pdfkit');
const { callAIWithRetry } = require('./ai');

async function generateTailoredResumePDF(profile, jobRole, jd) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[PDF Gen] Tailoring resume for ${jobRole}...`);

      const prompt = `You are an expert ATS-resume writer. I will provide you with a candidate's profile and a Job Description.
Your task is to output a strictly formatted JSON object containing the tailored content for a 1-page resume that perfectly matches the JD.

Candidate Name: ${profile.name}
Title: ${profile.title}
Phone: ${profile.phone}
LinkedIn: ${profile.linkedin}
GitHub: ${profile.github}

Base Resume/Skills:
${profile.resumeText || profile.skills?.join(', ')}

Job Description:
${jd || jobRole}

INSTRUCTIONS:
1. Extract 1 summary sentence (highly tailored to the JD, based ONLY on the provided resume/skills).
2. Extract the top 6 most relevant skills matching the JD from the candidate's existing skills. You may reword skills slightly to match JD keywords.
3. Extract professional experiences and projects (company/project name, title/role, dates, and 2 bullet points each). 
   - CRITICAL: DO NOT change the main titles, subtitles, companies, project names, or dates. They must remain exactly as they are in the Base Resume.
   - You MUST ONLY change the body (bullet points) of the experiences and projects. Reword the bullet points to include keywords from the JD and highlight relevant achievements.
   - Do not invent new experiences or projects. Output only what exists in the base resume.
4. Extract education (Degree, University) EXACTLY as provided in the Base Resume. Do not change its title or subtitle.

OUTPUT FORMAT (Valid JSON ONLY):
{
  "summary": "...",
  "skills": ["...", "..."],
  "experience": [
    {
      "title": "Software Engineer",
      "company": "Tech Corp",
      "dates": "2020 - Present",
      "bullets": ["...", "..."]
    }
  ],
  "projects": [
    {
      "title": "Project Name",
      "subtitle": "Role / Context",
      "dates": "2023",
      "bullets": ["...", "..."]
    }
  ],
  "education": "B.S. Computer Science, University Name"
}`;

      const resAI = await callAIWithRetry(prompt, 3, 2000);
      let jsonStr = resAI.text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
      
      if (!jsonStr.startsWith('{')) {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (match) jsonStr = match[0];
      }

      // Sanitize: JSON.parse fails if there are literal newlines/tabs inside string values.
      // Replacing them with spaces fixes both the strings and leaves structural spacing valid.
      jsonStr = jsonStr.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ');

      let tailored;
      try {
        tailored = JSON.parse(jsonStr);
      } catch (e) {
        console.error("Failed to parse AI JSON for tailored resume. Raw Output:", resAI.text);
        throw new Error("Failed to parse AI JSON for tailored resume");
      }

      // Build PDF
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text(profile.name, { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(profile.title || jobRole, { align: 'center' });
      doc.moveDown(0.5);
      
      const contactInfo = [profile.phone, profile.emailUser, profile.linkedin, profile.github].filter(Boolean).join(' | ');
      doc.fontSize(10).font('Helvetica').text(contactInfo, { align: 'center', color: '#555555' });
      doc.moveDown(1.5);

      // Summary
      doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text('PROFESSIONAL SUMMARY');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text(tailored.summary);
      doc.moveDown(1);

      // Skills
      doc.fontSize(12).font('Helvetica-Bold').text('KEY SKILLS');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text((tailored.skills || []).join(' • '));
      doc.moveDown(1);

      // Experience
      doc.fontSize(12).font('Helvetica-Bold').text('EXPERIENCE');
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
      doc.moveDown(0.5);

      (tailored.experience || []).forEach(exp => {
        doc.fontSize(11).font('Helvetica-Bold').text(exp.title, { continued: true });
        doc.font('Helvetica').text(` at ${exp.company}`, { continued: true });
        doc.text(`  |  ${exp.dates}`, { align: 'right' });
        doc.moveDown(0.3);
        
        (exp.bullets || []).forEach(bullet => {
          doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 10, width: 485 });
        });
        doc.moveDown(0.8);
      });

      // Projects
      if (tailored.projects && tailored.projects.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('PROJECTS');
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.5);

        tailored.projects.forEach(proj => {
          doc.fontSize(11).font('Helvetica-Bold').text(proj.title, { continued: true });
          if (proj.subtitle) {
             doc.font('Helvetica').text(` - ${proj.subtitle}`, { continued: true });
          }
          if (proj.dates) {
             doc.text(`  |  ${proj.dates}`, { align: 'right' });
          } else {
             doc.text(' ', { align: 'right' });
          }
          doc.moveDown(0.3);
          
          (proj.bullets || []).forEach(bullet => {
            doc.fontSize(10).font('Helvetica').text(`• ${bullet}`, { indent: 10, width: 485 });
          });
          doc.moveDown(0.8);
        });
      }

      // Education
      if (tailored.education) {
        doc.fontSize(12).font('Helvetica-Bold').text('EDUCATION');
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(tailored.education);
      }

      doc.end();
    } catch (err) {
      console.error('[PDF Gen] Error:', err);
      reject(err);
    }
  });
}

module.exports = { generateTailoredResumePDF };
