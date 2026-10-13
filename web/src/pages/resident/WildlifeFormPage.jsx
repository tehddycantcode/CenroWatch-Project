import { useState } from 'react';
import { wildlifeApi, fileUrl } from '@/lib/api';
import { ANIMAL_CONDITIONS, TURNOVER_METHODS, humanize } from '@/lib/reports';
import { FORM_TL } from '@/lib/tagalog';
import { useSpecies } from '@/lib/useSpecies';
import { HAZARD_TONE, HAZARD_LABEL, BADGE, hasHazard } from '@/lib/speciesLabels';
import { withOtherDetail, OTHER_DETAIL_MAX, DESCRIPTION_MAX } from '@/lib/otherCategory';
import { Bird } from 'lucide-react';
import ReportFormShell from '@/components/resident/ReportFormShell';
import BarangaySelect from '@/components/resident/BarangaySelect';
import PhotoField from '@/components/resident/PhotoField';
import LocationField from '@/components/resident/LocationField';
import { FormField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ConfirmDialog, { useConfirm } from '@/components/ui/confirm-dialog';
import PreviewableImage from '@/components/ui/previewable-image';

// One selectable species. The radio is a real <input type="radio">, only hidden
// visually: it gives arrow-key movement inside the group and a single tab stop
// for the whole group, which a <div role="radio"> would have to reimplement.
function SpeciesOption({ value, checked, onPick, title, subtitle, photo }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition ${
        checked ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent/50'
      }`}
    >
      <input
        type="radio"
        name="species_choice"
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      {/* Decorative: the name sits right beside it, so alt text would only make
          a screen reader say the species twice. Through fileUrl(), never the
          bare stored path - the API signs it, which makes it authorised, not
          absolute. */}
      {photo ? (
        <img
          src={fileUrl(photo)}
          alt=""
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
          <Bird className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
      {/* The name WRAPS rather than truncating: measured at 375px, "Black-crowned
          Night Heron" and "Southeast Asian Box Turtle" both ran past the row, and
          a clipped species name is the one thing on this form a resident cannot
          afford to misread. Only the second line, which repeats information the
          card below shows in full, is allowed to clip. */}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </label>
  );
}

// The hazard badge and the species' own handling note, shown ON THE FORM and
// not only on the public species guide. The person filling this in is the one
// standing near the animal; they have no reason to have visited a guide page
// first, and "keep your distance" is worth nothing on a page they never open.
// Renders nothing when the catalogue row has neither, so a species an Admin
// added without guidance shows no empty panel.
function SafetyNote({ species }) {
  const hazard = hasHazard(species.hazard);
  if (!hazard && !species.handling_note) return null;
  return (
    <div className="mt-2">
      {hazard && (
        <span className={`${BADGE} ${HAZARD_TONE.bg} ${HAZARD_TONE.fg}`}>
          {HAZARD_LABEL[species.hazard] || humanize(species.hazard)}
        </span>
      )}
      {species.handling_note && (
        <div className="mt-1.5 rounded-md bg-accent/50 p-2 text-xs">
          <span className="font-semibold">Safe handling: </span>
          {species.handling_note}
          <span className="mt-1 block text-muted-foreground">{FORM_TL.species_handling}</span>
        </div>
      )}
    </div>
  );
}

// Shown under the walk-in choice, and ONLY under it.
//
// THE LAST SENTENCE IS THE POINT. Everything before it is generic containment
// advice, and generic containment advice is wrong for exactly the animals that
// matter most: the catalogue's own notes say "Do not attempt to catch large
// individuals" (python), "Never handle bats with bare hands - rabies risk"
// (flying fox), "Do not keep as a pet" (civet). So this cannot be the final
// word - it defers to the species note rendered ABOVE it on this same page
// (SafetyNote), and it names the way out for somebody who picked walk-in before
// reading that note: switch to asking CENRO to collect it. That option is the
// other radio button, two lines up, so the escape route is real and reachable.
//
// It deliberately promises nothing about CENRO's side. Nothing here schedules a
// collection or states a response time.
function WalkInSafety() {
  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
      <p className="font-semibold text-amber-900">Only bring it in if you can do so safely.</p>
      <p className="mt-1 text-amber-900">
        Do not handle it with bare hands. If you can, put it in a sturdy, ventilated box or
        carrier, keep it covered and quiet, and keep children and pets away.
      </p>
      <p className="mt-1.5 font-semibold text-amber-900">
        If the note above says not to approach or catch this animal, do not &mdash; ask CENRO to
        collect it instead.
      </p>
      <p className="mt-1.5 text-amber-800">{FORM_TL.walkin_safety}</p>
    </div>
  );
}

// What to do with the animal NOW, on the success screen.
//
// BRANCHED, because the two answers are opposites. Telling somebody who is
// waiting for a CENRO pickup to contain and cover the animal is the one piece
// of advice that would put them next to it for longer.
//
// The species' own note goes FIRST when there is one. The generic line below it
// is the weaker claim, and ordering is how it defers: a reader meets "Never
// handle bats with bare hands" before anything about boxes.
//
// NOTHING HERE SAYS WHEN STAFF WILL ARRIVE. The system schedules nothing on
// submission - a turnover lands in a queue - so a time would be a promise no
// code keeps, which CLAUDE.md records as this project's most repeated mistake.
function TurnoverNextSteps({ method, species }) {
  const note = species?.handling_note;
  if (!method && !note) return null;
  return (
    <div className="space-y-2">
      {note && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Safe handling for {species.name}
          </div>
          <p className="mt-1 text-amber-900">{note}</p>
        </div>
      )}
      {method === 'Walk_In' && (
        <div className="rounded-lg bg-accent/50 p-3 text-sm">
          Bring it to the CENRO office during office hours with your reference number. Keep it
          contained and covered until you hand it over.
        </div>
      )}
      {method === 'Pickup_Request' && (
        <div className="rounded-lg bg-accent/50 p-3 text-sm">
          Keep your distance and keep people and pets away until CENRO staff arrive.
        </div>
      )}
    </div>
  );
}

// A heading plus its rows. Renders nothing when the search has emptied the
// group, so a filtered list never shows a heading over no options.
function SpeciesGroup({ title, subtitle, tone, rows, value, onPick }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone || 'text-muted-foreground'}`}>
        {title}
        {subtitle && (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground">{subtitle}</span>
        )}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {rows.map((s) => (
          <SpeciesOption
            key={s.name}
            value={s.name}
            checked={value === s.name}
            onPick={onPick}
            title={s.name}
            subtitle={s.local_name ? `(${s.local_name})` : s.scientific_name}
            photo={s.photo_path}
          />
        ))}
      </div>
    </div>
  );
}

export default function WildlifeFormPage() {
  const [form, setForm] = useState({
    species_category: '',
    animal_condition: '',
    turnover_method: '',
    description: '',
    barangay_id: '',
    address_details: '',
  });
  const [location, setLocation] = useState({ latitude: null, longitude: null });
  const [photos, setPhotos] = useState([]); // PhotoField emits an ARRAY
  // A catalogue species NAME, the literal 'Other', or '' before a pick. The
  // single source for which species is selected: it is what gets posted as
  // species_name, so there is no second copy in `form` to fall out of step.
  const [speciesChoice, setSpeciesChoice] = useState('');
  const [speciesQuery, setSpeciesQuery] = useState('');
  // What the resident types when the animal is not in the list. It is NOT posted
  // as species_name - that is a foreign key - fullDescription folds it into the
  // description's first line instead.
  const [otherDetail, setOtherDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmProps, ask] = useConfirm();
  const [success, setSuccess] = useState(null);

  const {
    common, endangered, byName,
    loading, error: speciesError,
  } = useSpecies();

  // Matches the local name as well as the English and scientific names, because
  // "sawa" is what a resident will type for a Reticulated Python. Without this
  // the local name is decoration: visible once you have already found the row.
  // The currently picked species always stays in the list, so narrowing the box
  // can never leave a controlled <select> pointing at an option that is gone.
  const q = speciesQuery.trim().toLowerCase();
  const matches = (s) => {
    if (!q || s.name === speciesChoice) return true;
    return [s.name, s.scientific_name, s.local_name]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  };
  const commonShown = common.filter(matches);
  const endangeredShown = endangered.filter(matches);
  const nothingMatches = Boolean(q) && !commonShown.length && !endangeredShown.length;

  // The picked catalogue row, or null.
  const selected = byName[speciesChoice] || null;
  const isOther = speciesChoice === 'Other';

  // The description as the server receives it. species_name is a foreign key into
  // the catalogue, so a name typed under "Other" cannot go in it. It becomes the
  // description's first line instead, where it is the first thing staff read -
  // the same fold the complaint form does for its "Other" type.
  const fullDescription = isOther
    ? withOtherDetail(form.description.trim(), otherDetail)
    : form.description.trim();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs = {};
    if (!speciesChoice) errs.species_name = 'Select a species.';
    // Required only for "Other", which has no category of its own. The three
    // options are a question a resident who saw the animal can answer.
    if (isOther && !form.species_category) {
      errs.species_category = 'Tell us whether it is a bird, mammal or reptile.';
    }
    // The typed species name is deliberately NOT required. A resident who cannot
    // identify the animal is exactly who "Other" exists for, and demanding a
    // name would push them into guessing - which is worse than "Other" for both
    // the record and the staff reading it.
    if (!form.animal_condition) errs.animal_condition = 'Select the animal condition.';
    // Required HERE but optional at the API, deliberately: an installed APK that
    // predates this question must keep working. See the rule in
    // backend/src/validators/wildlife.validators.js.
    if (!form.turnover_method) errs.turnover_method = 'Tell us how the animal will reach CENRO.';
    // A pin OR a landmark. Mirrors the API rule in
    // backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    // Checked here as well as on the server, so the refusal lands on the field
    // rather than as a banner after the whole form has been posted.
    if (!photos.length) errs.photo = 'A photo is required. Attach one of the animal, taken from a safe distance.';
    if (form.description.trim().length < 10) errs.description = 'Describe the sighting (at least 10 characters).';
    // The typed name is prepended to the description, and the server caps that at
    // DESCRIPTION_MAX. Checked here so a long report fails on the field the
    // resident can actually see, rather than as a 422 about something else.
    if (fullDescription.length > DESCRIPTION_MAX) {
      errs.description = `Description is too long (limit ${DESCRIPTION_MAX} characters).`;
    }
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    // Asked only after validate() passes, so nobody is asked to confirm a form
    // that is about to be rejected anyway.
    const ok = await ask({
      title: 'Ipadala na sa CENRO?',
      body: 'Matatanggap agad ito ng CENRO, at pwede mo itong sundan sa My Reports.',
      confirmLabel: 'Ipadala',
      cancelLabel: 'Hindi pa',
    });
    if (!ok) return;

    const fd = new FormData();
    // Always a catalogue name or 'Other', because that is all the picker offers.
    fd.append('species_name', speciesChoice);
    // The server derives the category from the species. This is only the
    // resident's answer for "Other", which has none of its own.
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('animal_condition', form.animal_condition);
    fd.append('turnover_method', form.turnover_method);
    fd.append('description', fullDescription);
    fd.append('barangay_id', form.barangay_id);
    // is_endangered is deliberately NOT sent: the server derives it from the species.
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
    for (const f of photos) fd.append('photos', f);

    setSubmitting(true);
    try {
      const res = await wildlifeApi.create(fd);
      setSuccess(res.data.turnover.reference_id);
    } catch (err) {
      if (Array.isArray(err.errors)) {
        const m = {};
        for (const { field, message } of err.errors) m[field] = message;
        setFieldErrors((p) => ({ ...p, ...m }));
      }
      setError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ReportFormShell
      title="Wildlife Turnover"
      subtitle="Report a sighting or turn over rescued wildlife"
      icon={Bird}
      tone="violet"
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      success={success}
      submitLabel="Submit Report"
      // `selected` is null for "Other", which has its own catalogue row and the
      // most important note in the set - treat an unidentified animal as
      // dangerous - so fall back to it rather than showing nothing.
      successNotice={
        <TurnoverNextSteps
          method={form.turnover_method}
          species={selected || (isOther ? byName.Other : null)}
        />
      }
    >
      {!speciesError && (
        <FormField id="species_filter" label="Find a species" hint={FORM_TL.species_filter}>
          <Input
            id="species_filter"
            placeholder="e.g. python, sawa, Varanus"
            value={speciesQuery}
            onChange={(e) => setSpeciesQuery(e.target.value)}
          />
        </FormField>
      )}

      <FormField
        label="Species"
        hint={FORM_TL.species_name}
        error={fieldErrors.species_name}
      >
        {speciesError ? (
          // A picker with no options cannot be submitted, so this is stated
          // rather than shown as an empty list.
          <p role="alert" className="text-sm text-destructive">{speciesError}</p>
        ) : loading ? (
          // The groups are empty until the catalogue arrives, so without this the
          // field would show nothing but the "Other" row and read as a list that
          // has only one entry.
          <p className="text-sm text-muted-foreground">Loading species&hellip;</p>
        ) : (
          // The two groups are SHOWN, not folded into a dropdown's <optgroup>
          // where a resident meets them only after opening the control. Which
          // group an animal falls in changes what happens to the report -
          // is_endangered drives priority review and the coordinate obfuscation
          // on the public map - so it belongs on the page, not inside the widget.
          <div role="radiogroup" aria-label="Species" className="space-y-4">
            <SpeciesGroup
              title="Common species"
              subtitle={FORM_TL.species_group_common}
              rows={commonShown}
              value={speciesChoice}
              onPick={setSpeciesChoice}
            />
            <SpeciesGroup
              title="Endangered or protected species"
              subtitle={FORM_TL.species_group_endangered}
              tone="text-amber-700"
              rows={endangeredShown}
              value={speciesChoice}
              onPick={setSpeciesChoice}
            />
            {/* Always last and never filtered out, so a search that matches
                nothing is not a dead end. */}
            <SpeciesOption
              value="Other"
              checked={speciesChoice === 'Other'}
              onPick={setSpeciesChoice}
              title={'Other (not in this list)\u2026'}
              subtitle={FORM_TL.species_other}
            />
          </div>
        )}
        {nothingMatches && (
          <p role="status" className="mt-1.5 text-xs text-muted-foreground">{FORM_TL.species_none}</p>
        )}
      </FormField>

      {selected && !isOther && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {/* No visible credit line here: it was clutter on the one screen a
              resident has to read quickly. The photos are CC BY / CC BY-SA and
              still require attribution, so it moves into the image's title
              instead, and the public species guide carries the full, readable
              credit list for every catalogue photo. Do not drop `title` without
              putting the attribution somewhere a reader can reach. */}
          {selected.photo_path && (
            <PreviewableImage
              src={fileUrl(selected.photo_path)}
              alt={`Reference photograph of the ${selected.name}`}
              caption={selected.photo_credit ? `Photo: ${selected.photo_credit}` : undefined}
              className="mb-2 mx-auto w-fit"
              imgClassName="max-h-48 w-auto object-contain"
            />
          )}
          {/* The extra angles, if an Admin has added any. This is the screen the
              gallery exists for: a resident deciding whether the animal in front
              of them is this row, where one photo of a coiled python says little
              about a stretched-out one. */}
          {(selected.photos || []).length > 0 && (
            <div className="mb-2 flex flex-wrap justify-center gap-1.5">
              {selected.photos.map((p) => (
                <PreviewableImage
                  key={p.species_photo_id}
                  src={fileUrl(p.photo_path)}
                  alt={p.caption ? `${selected.name}, ${p.caption}` : `${selected.name}, additional photograph`}
                  caption={`${selected.name}${p.caption ? ` - ${p.caption}` : ''} - photo: ${p.photo_credit}`}
                  className="h-14 w-20"
                  imgClassName="h-full w-full object-cover"
                />
              ))}
            </div>
          )}
          <p className="font-medium">
            {selected.name}
            {selected.scientific_name && <span className="ml-1 font-normal italic text-muted-foreground">{selected.scientific_name}</span>}
          </p>
          {selected.local_name && <p className="text-muted-foreground">{FORM_TL.species_also_called} ({selected.local_name})</p>}
          {selected.body_description && <p className="mt-1">{selected.body_description}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {[
              selected.category,
              selected.habitat,
              selected.biome && `${FORM_TL.species_found_in}: ${humanize(selected.biome)}`,
              selected.indicator && humanize(selected.indicator),
            ].filter(Boolean).join(' \u00b7 ')}
          </p>
          {selected.is_endangered && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {FORM_TL.species_protected}
            </p>
          )}
          <SafetyNote species={selected} />
        </div>
      )}

      {/* "Other" has a catalogue row of its own and it carries the most
          important handling note in the set - treat an unidentified animal as
          dangerous. The identification card is suppressed for it (there is no
          animal to identify), so without this the one person who does not know
          what they are looking at got no safety guidance at all. */}
      {isOther && byName.Other?.handling_note && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <SafetyNote species={byName.Other} />
        </div>
      )}

      {/* READ-ONLY, not hidden. The server derives this from the species, so an
          editable box would be a lie - but a resident should still be able to
          notice they picked the wrong animal. The only case where a human picks
          is "Other", which has no category of its own. */}
      {selected && selected.category && (
        <FormField label="Category">
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {selected.category}
            <span className="ml-2 text-xs text-muted-foreground">Set automatically from the species you selected.</span>
          </p>
        </FormField>
      )}

      {isOther && (
        <>
          <FormField id="species_category" label="What kind of animal is it?" error={fieldErrors.species_category}>
            <Select id="species_category" value={form.species_category} onChange={set('species_category')}>
              <option value="">Select one</option>
              <option value="Bird">Bird</option>
              <option value="Mammal">Mammal</option>
              <option value="Reptile">Reptile</option>
            </Select>
          </FormField>

          <FormField id="species_other" label="Species name (if you know it)">
            <Input
              id="species_other"
              placeholder="e.g. Sea turtle, Tarsier"
              maxLength={OTHER_DETAIL_MAX}
              value={otherDetail}
              onChange={(e) => setOtherDetail(e.target.value)}
            />
          </FormField>
        </>
      )}

      <FormField
        id="animal_condition"
        label="Animal condition"
        hint={FORM_TL.animal_condition}
        error={fieldErrors.animal_condition}
      >
        <Select id="animal_condition" value={form.animal_condition} onChange={set('animal_condition')}>
          <option value="">Select condition</option>
          {ANIMAL_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </FormField>

      {/* NO DEFAULT IS PRE-SELECTED. Either answer is a commitment - one says a
          person will walk into the office, the other books a trip for staff -
          and a pre-ticked box would record a commitment the reporter never
          made. Required here and optional at the API, so an installed APK that
          predates the question keeps working; see the validator's note. */}
      <FormField label="How will the animal reach CENRO?" hint={FORM_TL.turnover_method} error={fieldErrors.turnover_method}>
        <div role="radiogroup" aria-label="How will the animal reach CENRO?" className="grid gap-2">
          {TURNOVER_METHODS.map((m) => (
            <div key={m.value}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                  form.turnover_method === m.value
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:bg-accent/50'
                }`}
              >
                <input
                  type="radio"
                  name="turnover_method"
                  value={m.value}
                  checked={form.turnover_method === m.value}
                  onChange={() => setForm((f) => ({ ...f, turnover_method: m.value }))}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.value === 'Walk_In' ? FORM_TL.turnover_walkin : FORM_TL.turnover_pickup}
                  </span>
                </span>
              </label>
              {/* Shown only once walk-in is CHOSEN, directly under that choice.
                  Someone who asked CENRO to collect the animal should not be
                  told how to box it up - that is the opposite of what they
                  need, and advice aimed at the wrong person is how people stop
                  reading the advice that matters. */}
              {m.value === 'Walk_In' && form.turnover_method === 'Walk_In' && <WalkInSafety />}
            </div>
          ))}
        </div>
      </FormField>

      <FormField id="barangay_id" label="Barangay" hint={FORM_TL.barangay} error={fieldErrors.barangay_id}>
        <BarangaySelect value={form.barangay_id} onChange={set('barangay_id')} />
      </FormField>

      <FormField id="description" label="Description" hint={FORM_TL.description} error={fieldErrors.description}>
        <Textarea id="description" rows={4} placeholder="Describe the animal and the situation." value={form.description} onChange={set('description')} />
      </FormField>

      {/* There is no "I believe this is an endangered species" checkbox. Endangered
          status comes from the species catalogue: it drives public-map coordinate
          obfuscation, and a reporter must not decide whether a rescue site is
          hidden from a poacher. The server ignores is_endangered if anything still
          sends it. */}

      <FormField label="Location" hint={FORM_TL.location_found} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </FormField>

      <FormField
        id="address_details"
        label="Address or landmark"
        hint={FORM_TL.address_details}
        error={fieldErrors.address_details}
      >
        <Input
          id="address_details"
          maxLength={255}
          placeholder="e.g. Beside the covered court, Purok 3"
          value={form.address_details}
          onChange={set('address_details')}
        />
      </FormField>

      <FormField label="Photos (required)" hint={FORM_TL.photo} error={fieldErrors.photo}>
        <PhotoField onChange={setPhotos} />
      </FormField>
      <ConfirmDialog {...confirmProps} />
    </ReportFormShell>
  );
}
