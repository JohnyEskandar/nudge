
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fromPicked,
  markDuplicates,
  normalizeName,
  parseContacts,
  pickContacts,
  pickerSupport,
} from './contacts'

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

  // A trailing newline is invisible and comes free with a spreadsheet cell copy, a line
  // copied out of Notes, or an Enter pressed after pasting. Counting it as a second line
  // used to collapse the whole comma list into one person named "Maya, Tom, Ana".
  it('splits on commas despite a trailing newline', () => {
    expect(names('Maya, Tom, Ana\n')).toEqual(['Maya', 'Tom', 'Ana'])
  })

  it('splits on commas despite a trailing CRLF', () => {
    expect(names('Maya, Tom, Ana\r\n')).toEqual(['Maya', 'Tom', 'Ana'])
  })

  it('splits on commas despite a trailing blank line', () => {
    expect(names('Maya, Tom, Ana\n  ')).toEqual(['Maya', 'Tom', 'Ana'])
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

  // Two numbers and no name leaves the second number standing where a name should be.
  // Nothing else flags it, so without this it arrives ticked and unlabelled and the
  // default action imports a friend called "+1 555 010 9999".
  it('flags a phone number that ended up as the name', () => {
    const [c] = parseContacts('+1 555 010 1234, +1 555 010 9999')
    expect(c.name).toBe('+1 555 010 9999')
    expect(c.note).toBe('unlikely')
    expect(c.include).toBe(false)
  })

  it('leaves a real name that happens to contain digits alone', () => {
    const [c] = parseContacts('Maya Okonkwo 2nd')
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

describe('parseContacts — leading and edge cases', () => {
  it('merges a leading phone-only segment forward into the following name', () => {
    const [c] = parseContacts('+1 555 010 1234, Maya')
    expect(c.name).toBe('Maya')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('drops a bare phone with no name to attach it to', () => {
    expect(parseContacts('+1 555 010 1234')).toEqual([])
  })

  it('does not attach a second phone to a person who already has one', () => {
    const out = parseContacts('+1 555 010 1234, Maya, +1 555 010 9999')
    expect(out.map((c) => c.name)).toEqual(['Maya'])
    expect(out.map((c) => c.phone)).toEqual(['+1 555 010 1234'])
  })
})

describe('normalizeName', () => {
  it('ignores case and extra whitespace', () => {
    expect(normalizeName('  Maya   OKONKWO ')).toBe('maya okonkwo')
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('markDuplicates', () => {
  const existing = [{ name: 'Maya Okonkwo' }, { name: 'Sam Okafor' }]

  it('flags and unchecks someone already on the list', () => {
    const [c] = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    expect(c.note).toBe('duplicate')
    expect(c.include).toBe(false)
  })

  it('ignores case and spacing when matching', () => {
    const [c] = markDuplicates(parseContacts('  maya   okonkwo '), existing)
    expect(c.note).toBe('duplicate')
  })

  it('leaves someone new alone', () => {
    const [c] = markDuplicates(parseContacts('Ana Ruiz'), existing)
    expect(c.note).toBeNull()
    expect(c.include).toBe(true)
  })

  it('takes duplicate over unlikely when a row is both', () => {
    const long = 'x'.repeat(61)
    const [c] = markDuplicates(parseContacts(long), [{ name: long }])
    expect(c.note).toBe('duplicate')
  })

  it('clears the flag when a renamed row is no longer a duplicate', () => {
    const flagged = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    const renamed = flagged.map((c) => ({ ...c, name: 'Maya Adeyemi' }))
    expect(markDuplicates(renamed, existing)[0].note).toBeNull()
  })

  // Re-running over the whole list because some *other* row was edited must not undo a
  // deliberate choice to import someone you already have.
  it('keeps a duplicate the user ticked back on', () => {
    const flagged = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    const reTicked = flagged.map((c) => ({ ...c, include: true }))
    expect(markDuplicates(reTicked, existing)[0].include).toBe(true)
  })

  it('returns an already-flagged duplicate untouched', () => {
    const flagged = markDuplicates(parseContacts('Maya Okonkwo'), existing)
    expect(markDuplicates(flagged, existing)[0]).toBe(flagged[0])
  })

  it('never re-ticks a row the user unticked', () => {
    const clean = markDuplicates(parseContacts('Ana Ruiz'), existing)
    const unticked = clean.map((c) => ({ ...c, include: false }))
    expect(markDuplicates(unticked, existing)[0].include).toBe(false)
  })

  it('restores unlikely, not null, when an implausible name leaves a collision', () => {
    const long = 'x'.repeat(61)
    const flagged = markDuplicates(parseContacts(long), [{ name: long }])
    expect(flagged[0].note).toBe('duplicate')
    const renamed = flagged.map((c) => ({ ...c, name: 'y'.repeat(61) }))
    expect(markDuplicates(renamed, [{ name: long }])[0].note).toBe('unlikely')
  })

  it('copes with no existing friends', () => {
    expect(markDuplicates(parseContacts('Maya'), [])[0].note).toBeNull()
    expect(markDuplicates(parseContacts('Maya'), undefined)[0].note).toBeNull()
  })
})

describe('fromPicked', () => {
  it('takes the first name and the first number', () => {
    const [c] = fromPicked([{ name: ['Maya Okonkwo', 'M.O.'], tel: ['+1 555 010 1234', '+1 555 000'] }])
    expect(c.name).toBe('Maya Okonkwo')
    expect(c.phone).toBe('+1 555 010 1234')
  })

  it('handles a contact with no number', () => {
    expect(fromPicked([{ name: ['Ana Ruiz'] }])[0].phone).toBeNull()
  })

  it('skips a contact with no usable name', () => {
    expect(fromPicked([{ tel: ['+1 555 010 1234'] }, { name: [''] }, { name: ['Ana'] }])).toHaveLength(1)
  })

  it('applies the given category', () => {
    expect(fromPicked([{ name: ['Ana'] }], { category: 'mentor' })[0].category).toBe('mentor')
  })

  it('collapses duplicates the picker returned twice', () => {
    expect(fromPicked([{ name: ['Ana'] }, { name: ['ana'] }])).toHaveLength(1)
  })

  it('copes with nothing picked', () => {
    expect(fromPicked([])).toEqual([])
    expect(fromPicked(undefined)).toEqual([])
  })
})

describe('pickerSupport', () => {
  it('is supported when the API is present', () => {
    vi.stubGlobal('navigator', { contacts: { select: () => {} }, userAgent: '' })
    expect(pickerSupport().state).toBe('supported')
  })

  it('needs the flag on iOS when the API is missing', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0)' })
    expect(pickerSupport().state).toBe('needs-flag')
  })

  it('is simply unsupported off iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' })
    expect(pickerSupport().state).toBe('unsupported')
  })
})

describe('pickContacts', () => {
  it('asks for names and numbers, allowing several', async () => {
    const select = vi.fn().mockResolvedValue([{ name: ['Ana Ruiz'], tel: ['+1 555 010 1234'] }])
    vi.stubGlobal('navigator', { contacts: { select }, userAgent: '' })

    const out = await pickContacts()
    expect(select).toHaveBeenCalledWith(['name', 'tel'], { multiple: true })
    expect(out[0].name).toBe('Ana Ruiz')
  })

  it('returns nothing when the picker is cancelled', async () => {
    vi.stubGlobal('navigator', { contacts: { select: vi.fn().mockResolvedValue([]) }, userAgent: '' })
    expect(await pickContacts()).toEqual([])
  })

  it('throws when there is no picker', async () => {
    vi.stubGlobal('navigator', { userAgent: '' })
    await expect(pickContacts()).rejects.toThrow()
  })
})
