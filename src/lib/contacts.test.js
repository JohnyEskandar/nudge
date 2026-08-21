
import { describe, expect, it } from 'vitest'
import { normalizeName, parseContacts } from './contacts'

const names = (text, opts) => parseContacts(text, opts).map((c) => c.name)

describe('parseContacts — splitting', () => {
  it('takes one person per line', () => {
    expect(names('Maya Okonkwo\nSam Okafor')).toEqual(['Maya Okonkwo', 'Sam Okafor'])
  })

  it('ignores blank lines entirely', () => {
    expect(names('Maya\n\n   \nSam')).toEqual(['Maya', 'Sam'])
  })

  it('splits a single line on commas', () => {
    expect(names('Maya, Tom, Ana')).toEqual(['Maya', 'Tom', 'Ana'])
  })

  it('leaves "Last, First" alone when there are newlines', () => {
    expect(names('Okonkwo, Maya\nOkafor, Sam')).toEqual(['Okonkwo, Maya', 'Okafor, Sam'])
  })

  it('merges a phone-only segment back into the name before it', () => {
    const [c] = parseContacts('Maya Okonkwo, +1 555 010 1234')
    expect(c.name).toBe('Maya Okonkwo')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('handles alternating names and phones on one line', () => {
    const out = parseContacts('Maya, +1 555 010 1234, Tom, +1 555 010 9999')
    expect(out.map((c) => c.name)).toEqual(['Maya', 'Tom'])
    expect(out.map((c) => c.phone)).toEqual(['+1 555 010 1234', '+1 555 010 9999'])
  })
})

describe('parseContacts — phones', () => {
  it('lifts a phone out of the line', () => {
    const [c] = parseContacts('Sam Okafor +1 555 010 1234')
    expect(c.name).toBe('Sam Okafor')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('needs at least seven digits', () => {
    const [c] = parseContacts('Flat 221 Baker')
    expect(c.phone).toBeNull()
    expect(c.name).toBe('Flat 221 Baker')
  })

  it('keeps the number exactly as written', () => {
    const [c] = parseContacts('Ana (555) 010-1234')
    expect(c.phone).toBe('(555) 010-1234')
  })

  it('is null when there is no number', () => {
    expect(parseContacts('Maya Okonkwo')[0].phone).toBeNull()
  })
})

describe('parseContacts — decoration', () => {
  it('strips bullet markers', () => {
    expect(names('- Maya\n* Sam\n• Ana')).toEqual(['Maya', 'Sam', 'Ana'])
  })

  it('strips numbered markers', () => {
    expect(names('1. Maya\n2) Sam')).toEqual(['Maya', 'Sam'])
  })

  it('strips emails and angle brackets', () => {
    expect(names('Sam Okafor <sam@example.com>')).toEqual(['Sam Okafor'])
  })

  it('strips surrounding quotes', () => {
    expect(names('"Ana Ruiz"')).toEqual(['Ana Ruiz'])
  })

  it('keeps an apostrophe inside a name', () => {
    expect(names("Siobhan O'Brien")).toEqual(["Siobhan O'Brien"])
  })

  it('keeps a curly apostrophe inside a name', () => {
    expect(names('Siobhan O’Brien')).toEqual(['Siobhan O’Brien'])
  })

  it('drops a line that is only an email', () => {
    expect(names('sam@example.com\nMaya')).toEqual(['Maya'])
  })
})

describe('parseContacts — candidate shape', () => {
  it('defaults the category to friend', () => {
    expect(parseContacts('Maya')[0].category).toBe('friend')
  })

  it('takes the category it is given', () => {
    expect(parseContacts('Maya', { category: 'family' })[0].category).toBe('family')
  })

  it('includes ordinary rows by default', () => {
    const [c] = parseContacts('Maya')
    expect(c.include).toBe(true)
    expect(c.note).toBeNull()
  })

  it('gives every row a distinct key', () => {
    const out = parseContacts('Maya\nSam\nAna')
    expect(new Set(out.map((c) => c.key)).size).toBe(3)
  })
})

describe('parseContacts — implausible names', () => {
  it('flags something too long, unchecked, without dropping it', () => {
    const [c] = parseContacts('x'.repeat(61))
    expect(c.note).toBe('unlikely')
    expect(c.include).toBe(false)
    expect(c.name).toHaveLength(61)
  })

  it('flags something with too many words', () => {
    const [c] = parseContacts('one two three four five six seven')
    expect(c.note).toBe('unlikely')
    expect(c.include).toBe(false)
  })

  it('leaves a normal long-ish name alone', () => {
    const [c] = parseContacts('Maria Fernanda Del Carmen Ruiz')
    expect(c.note).toBeNull()
    expect(c.include).toBe(true)
  })
})

describe('parseContacts — limits', () => {
  it('collapses duplicates within the paste, keeping the first', () => {
    const out = parseContacts('Maya Okonkwo\nmaya  okonkwo\nSam')
    expect(out.map((c) => c.name)).toEqual(['Maya Okonkwo', 'Sam'])
  })

  it('caps at 200 rows, after collapsing duplicates', () => {
    const text = Array.from({ length: 250 }, (_, i) => `Person ${i}`).join('\n')
    expect(parseContacts(text)).toHaveLength(200)
  })

  it('returns nothing for empty input', () => {
    expect(parseContacts('')).toEqual([])
    expect(parseContacts('   \n  ')).toEqual([])
  })
})

describe('normalizeName', () => {
  it('ignores case and extra whitespace', () => {
    expect(normalizeName('  Maya   OKONKWO ')).toBe('maya okonkwo')
  })
})

