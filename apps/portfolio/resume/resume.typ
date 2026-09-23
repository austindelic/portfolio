// The original resume used Libertinus Serif. Typst bundles and embeds this family.
#let data = json("content.json")
#set document(title: data.name + " - Resume", author: data.name)
#set page(paper: "a4", margin: (x: 15mm, top: 13mm, bottom: 13mm))
#set text(font: "Libertinus Serif", size: 11pt, lang: "en", region: "AU")
#set par(leading: 0.55em, spacing: 4pt, justify: false)
#set list(indent: 0pt, body-indent: 10pt, spacing: 4pt)

#let section(label) = block(above: 11pt, below: 5pt, sticky: true)[
  #text(size: 11.5pt, weight: "bold", upper(label))
  #v(2pt)
  #line(length: 100%, stroke: 0.6pt)
]
#let dated(label, dates) = grid(
  columns: (1fr, auto), column-gutter: 12pt,
  align: (left, right), label, dates,
)
#let bullets(items) = if items.len() > 0 {
  list(..items.map(item => [#item]))
}

#align(center)[
  #text(size: 21pt, weight: "bold", upper(data.name))
  #v(3pt)
  #text(size: 10.5pt, weight: "bold", data.headline)
  #v(2pt)
  #data.location
  #v(3pt)
  #text(size: 9pt)[
    #data.contacts.map(c => link(c.url, c.label)).join([ #h(4pt) · #h(4pt) ])
  ]
]

#section("Work experience")
#for job in data.experience {
  block(breakable: false, above: 9pt, below: 0pt)[
    #strong(job.organisation)
    #v(1pt)
    #dated(emph(job.role), job.dates)
    #v(2pt)
    #bullets(job.bullets)
  ]
}

#section("Education")
#strong(data.education.institution)
#v(1pt)
#dated(emph(data.education.degree), data.education.dates)
#v(2pt)
#bullets(data.education.details)

#section("Projects")
#for project in data.projects {
  block(breakable: false, above: 8pt, below: 0pt)[
    #strong(link(project.url, project.name)) #text("(" + project.description + ")")
    #v(2pt)
    #bullets(project.bullets)
  ]
}

#section("Recognition")
#bullets(data.recognition)

#section("Technical skills")
#for skill in data.skills {
  [#strong(skill.label + ":") #skill.text]
  parbreak()
}

#context assert(counter(page).final().first() == 1,
  message: "Resume exceeds one page. Shorten content before publishing.")
