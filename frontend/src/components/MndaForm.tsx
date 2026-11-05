import type { ReactNode } from "react";
import type { MndaErrors, MndaValues, Party } from "@/lib/mnda";

type FormProps = {
  values: MndaValues;
  errors: MndaErrors;
  onChange: (patch: Partial<MndaValues>) => void;
  onPartyChange: (index: number, patch: Partial<Party>) => void;
};

function FieldError({ name, errors }: { name: string; errors: MndaErrors }) {
  if (!errors[name]) return null;
  return (
    <p id={`${name}-error`} className="text-error mt-1 text-sm font-medium">
      {errors[name]}
    </p>
  );
}

function fieldProps(name: string, errors: MndaErrors) {
  return {
    id: name,
    name,
    "aria-invalid": Boolean(errors[name]) || undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  };
}

type TextFieldProps = {
  name: string;
  label: string;
  help?: string;
  value: string;
  errors: MndaErrors;
  onChange: (value: string) => void;
  multiline?: boolean;
  autoComplete?: string;
};

function TextField({
  name,
  label,
  help,
  value,
  errors,
  onChange,
  multiline,
  autoComplete,
}: TextFieldProps) {
  const props = {
    ...fieldProps(name, errors),
    value,
    autoComplete,
    className: "field-input",
  };
  return (
    <div>
      <label htmlFor={name} className="block font-medium">
        {label}
      </label>
      {help && <p className="text-muted text-sm">{help}</p>}
      {multiline ? (
        <textarea
          {...props}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...props}
          type="text"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <FieldError name={name} errors={errors} />
    </div>
  );
}

type TermOptionProps<T extends string> = {
  legend: string;
  help: string;
  name: string;
  type: T;
  fixedValue: T;
  otherValue: T;
  otherLabel: string;
  yearsName: string;
  yearsLabel: string;
  yearsSuffix: string;
  years: string;
  errors: MndaErrors;
  onTypeChange: (type: T) => void;
  onYearsChange: (years: string) => void;
};

function TermOption<T extends string>({
  legend,
  help,
  name,
  type,
  fixedValue,
  otherValue,
  otherLabel,
  yearsName,
  yearsLabel,
  yearsSuffix,
  years,
  errors,
  onTypeChange,
  onYearsChange,
}: TermOptionProps<T>) {
  const isFixed = type === fixedValue;
  return (
    <fieldset>
      <legend className="font-medium">{legend}</legend>
      <p className="text-muted text-sm">{help}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={isFixed}
            onChange={() => onTypeChange(fixedValue)}
            className="accent-ink size-4"
          />
          {yearsLabel}
        </label>
        <input
          {...fieldProps(yearsName, errors)}
          type="text"
          inputMode="numeric"
          aria-label={`${legend}: number of years`}
          value={years}
          disabled={!isFixed}
          onChange={(event) => onYearsChange(event.target.value)}
          className="field-input mt-0 w-16 text-center disabled:opacity-50"
        />
        <span>{yearsSuffix}</span>
      </div>
      <FieldError name={yearsName} errors={errors} />
      <label className="mt-2 flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={!isFixed}
          onChange={() => onTypeChange(otherValue)}
          className="accent-ink size-4"
        />
        {otherLabel}
      </label>
    </fieldset>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-text/15 flex flex-col gap-5 border-t pt-6">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function PartyFields({
  index,
  party,
  errors,
  onChange,
}: {
  index: number;
  party: Party;
  errors: MndaErrors;
  onChange: (patch: Partial<Party>) => void;
}) {
  const name = (field: keyof Party) => `parties.${index}.${field}`;
  const common = { errors };
  return (
    <FormSection title={`Party ${index + 1}`}>
      <TextField
        {...common}
        name={name("company")}
        label="Company"
        value={party.company}
        onChange={(company) => onChange({ company })}
      />
      <TextField
        {...common}
        name={name("name")}
        label="Print name"
        help="The person signing for this company"
        value={party.name}
        onChange={(value) => onChange({ name: value })}
      />
      <TextField
        {...common}
        name={name("title")}
        label="Title"
        value={party.title}
        onChange={(title) => onChange({ title })}
      />
      <TextField
        {...common}
        name={name("noticeAddress")}
        label="Notice address"
        help="Use either email or postal address"
        value={party.noticeAddress}
        onChange={(noticeAddress) => onChange({ noticeAddress })}
        multiline
      />
    </FormSection>
  );
}

export function MndaForm({
  values,
  errors,
  onChange,
  onPartyChange,
}: FormProps) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection title="Agreement terms">
        <TextField
          name="purpose"
          label="Purpose"
          help="How Confidential Information may be used"
          value={values.purpose}
          errors={errors}
          onChange={(purpose) => onChange({ purpose })}
          multiline
        />
        <div>
          <label htmlFor="effectiveDate" className="block font-medium">
            Effective date
          </label>
          <input
            {...fieldProps("effectiveDate", errors)}
            type="date"
            value={values.effectiveDate}
            onChange={(event) =>
              onChange({ effectiveDate: event.target.value })
            }
            className="field-input"
          />
          <FieldError name="effectiveDate" errors={errors} />
        </div>
        <TermOption
          legend="MNDA term"
          help="The length of this MNDA"
          name="termType"
          type={values.termType}
          fixedValue="fixed"
          otherValue="untilTerminated"
          otherLabel="Continues until terminated"
          yearsName="termYears"
          yearsLabel="Expires"
          yearsSuffix="year(s) from effective date"
          years={values.termYears}
          errors={errors}
          onTypeChange={(termType) => onChange({ termType })}
          onYearsChange={(termYears) => onChange({ termYears })}
        />
        <TermOption
          legend="Term of confidentiality"
          help="How long Confidential Information is protected"
          name="confidentialityType"
          type={values.confidentialityType}
          fixedValue="fixed"
          otherValue="perpetual"
          otherLabel="In perpetuity"
          yearsName="confidentialityYears"
          yearsLabel="Lasts"
          yearsSuffix="year(s) from effective date"
          years={values.confidentialityYears}
          errors={errors}
          onTypeChange={(confidentialityType) =>
            onChange({ confidentialityType })
          }
          onYearsChange={(confidentialityYears) =>
            onChange({ confidentialityYears })
          }
        />
        <TextField
          name="governingLaw"
          label="Governing law"
          help="The state whose laws apply, such as Delaware"
          value={values.governingLaw}
          errors={errors}
          onChange={(governingLaw) => onChange({ governingLaw })}
        />
        <TextField
          name="jurisdiction"
          label="Jurisdiction"
          help="City or county and state, such as New Castle, DE"
          value={values.jurisdiction}
          errors={errors}
          onChange={(jurisdiction) => onChange({ jurisdiction })}
        />
        <TextField
          name="modifications"
          label="MNDA modifications (optional)"
          help="Any changes to the Standard Terms"
          value={values.modifications}
          errors={errors}
          onChange={(modifications) => onChange({ modifications })}
          multiline
        />
      </FormSection>
      {values.parties.map((party, index) => (
        <PartyFields
          key={index}
          index={index}
          party={party}
          errors={errors}
          onChange={(patch) => onPartyChange(index, patch)}
        />
      ))}
    </div>
  );
}
