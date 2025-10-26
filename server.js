require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const axios = require('axios')
const path = require('path')
const puppeteer = require('puppeteer')
const sanitizeHtml = require('sanitize-html')

const app = express()
const PORT = process.env.PORT || 4000
const OPENAI_KEY = process.env.OPENAI_API_KEY

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }))
app.use(bodyParser.json({ limit: '1mb' }))

// Simple in-memory storage for demo (replace with DB for production)
const sessions = {}

function sanitize(obj){
  if(!obj || typeof obj !== 'object') return obj
  const out = Array.isArray(obj) ? [] : {}
  for(const k in obj){
    if(typeof obj[k] === 'string') out[k] = sanitizeHtml(obj[k], { allowedTags: [], allowedAttributes: {} })
    else out[k] = sanitize(obj[k])
  }
  return out
}

// Home - resume input form
app.get('/', (req, res) => {
  res.render('form', { resume: defaultResume() })
})

// Receive form submit -> store and show preview
app.post('/preview', (req, res) => {
  const id = String(Date.now())
  const cleaned = sanitize(req.body.resume ? JSON.parse(req.body.resume) : req.body)
  sessions[id] = cleaned
  res.redirect(`/preview/${id}`)
})

app.get('/preview/:id', (req, res) => {
  const id = req.params.id
  const resume = sessions[id]
  if(!resume) return res.status(404).send('Not found')
  res.render('preview', { id, resume })
})

// AI suggestions endpoint (called from preview page)
app.post('/api/suggest/:id', async (req, res) => {
  if(!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set on server' })
  const id = req.params.id
  const resume = sessions[id]
  if(!resume) return res.status(404).json({ error: 'Resume not found' })

  // build prompt
  const prompt = `You are a professional career coach. Given the following resume JSON, produce:
1) an improved 2-3 sentence professional summary,
2) up to 3 concise, actionable improvement bullets per experience entry,
3) a short list (8-15) of high-impact keywords/skills the candidate should highlight.
Return plain text sections labeled: SUMMARY, IMPROVEMENTS, KEYWORDS.
Resume: ${JSON.stringify(resume)}`

  try{
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 700
    }, {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` }
    })

    const suggestions = response.data.choices?.[0]?.message?.content || 'No suggestions returned.'
    return res.json({ suggestions })
  }catch(err){
    console.error('OpenAI error', err?.response?.data || err.message)
    return res.status(500).json({ error: 'AI request failed' })
  }
})

// Export PDF of the preview (server-side)
app.get('/export/:id.pdf', async (req, res) => {
  const id = req.params.id.replace('.pdf','')
  const resume = sessions[id]
  if(!resume) return res.status(404).send('Not found')

  // Render the preview route to HTML and convert with puppeteer
  try{
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    // Create HTML by rendering EJS view to string
    const ejs = require('ejs')
    const html = await ejs.renderFile(path.join(__dirname, 'views', 'preview_pdf.ejs'), { resume, id })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom:'20mm', left:'15mm', right:'15mm' } })
    await browser.close()

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${(resume.name||'resume').replace(/\s+/g,'_')}.pdf"`,
      'Content-Length': pdfBuffer.length
    })
    res.send(pdfBuffer)
  }catch(err){
    console.error('PDF generation error', err)
    res.status(500).send('PDF generation failed')
  }
})

function defaultResume(){
  return {
    name: '',
    title: '',
    email: '',
    phone: '',
    summary: '',
    skills: [],
    experience: [],
    education: []
  }
}

app.listen(PORT, ()=> console.log(`Server listening on http://localhost:${PORT}`))
