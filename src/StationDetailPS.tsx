import React, { useMemo, useState } from 'react';
import type { PSStationJSON, StationMetadataRow } from './types';

type IconProps = { size?: number; className?: string };
function BookOpen({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>; }
function FileText({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>; }
function User({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function GraduationCap({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>; }

type TabKey = 'station' | 'student' | 'ps' | 'correction';

interface Props {
  station: PSStationJSON;
  darkMode: boolean;
}

// ── Helper sub-components ─────────────────────────────────────────────

const SectionHeader = ({ title }: { title: string }) => (
  <div className="bg-[#F1F5F9] border-l-[4px] border-[#64748B] px-4 py-3 mb-8 rounded-[2px]">
    <h2 className="text-[24px] font-bold text-[#0F172A] tracking-tight">{title}</h2>
  </div>
);

const renderValue = (value: string | string[]) => {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, idx) => (
          <p key={idx} className="leading-[1.55]">
            {item}
          </p>
        ))}
      </div>
    );
  }
  return <p className="leading-[1.55]">{value}</p>;
};

const MetaTable = ({
  rows,
  labelWidth = '54%',
  valueWidth = '46%',
}: {
  rows: StationMetadataRow[];
  labelWidth?: string;
  valueWidth?: string;
}) => (
  <div className="overflow-hidden border border-[#64748B] bg-white">
    <table className="w-full border-collapse table-fixed">
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="bg-[#E2E8F0]">
            <td
              style={{ width: labelWidth }}
              className="border border-[#64748B] px-4 py-4 text-[15px] font-bold text-[#1E293B] align-top"
            >
              {row.label}
            </td>
            <td
              style={{ width: valueWidth }}
              className="border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-top"
            >
              {renderValue(row.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CorrectionGrid = ({ elements }: { elements: Array<{ id: number; label: string }> }) => (
  <div className="overflow-hidden border border-slate-400 bg-white mb-12">
    <table className="w-full border-collapse table-fixed">
      <thead>
        <tr className="bg-[#CBD5E1] text-[#0F172A]">
          <th className="w-[76px] border border-slate-400 px-3 py-3"></th>
          <th className="border border-slate-400 px-4 py-3 text-left align-bottom font-bold text-[15px]">
            Critères ciblés
          </th>
          <th className="w-[100px] border border-slate-400 px-2 py-3 text-left align-top font-bold text-[15px] leading-6">
            Observé
            <br />= 1
            <br />
            Non-observé
            <br />= 0
          </th>
        </tr>
      </thead>
      <tbody>
        {elements.map((row) => (
          <tr key={row.id} className="bg-[#E5E7EB]">
            <td className="border border-slate-400 px-3 py-4 align-top font-bold text-[15px] text-[#0F172A]">
              {row.id}
            </td>
            <td className="border border-slate-400 px-4 py-4 text-[15px] leading-7 text-[#1E293B]">
              {row.label}
            </td>
            <td className="border border-slate-400 px-3 py-4"></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CriterionBlock = ({
  criterion,
}: {
  criterion: { id: number; label: string; rationale: string };
}) => (
  <div className="space-y-8">
    <h4 className="text-2xl font-bold text-[#1E293B]">Critère {criterion.id}</h4>
    <ul className="space-y-6">
      <li className="flex flex-col gap-2">
        <div className="flex items-center gap-4 ml-6">
          <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
          <span className="font-bold text-[19px] text-[#334155]">Critère :</span>
        </div>
        <p className="ml-16 text-[19px] text-[#475569] font-medium leading-relaxed">
          {criterion.label}
        </p>
      </li>
      <li className="flex flex-col gap-2">
        <div className="flex items-center gap-4 ml-6">
          <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
          <span className="font-bold text-[19px] text-[#334155]">Correction :</span>
        </div>
        <p className="ml-16 text-[19px] text-[#475569] font-medium leading-[1.85] whitespace-pre-wrap">
          {criterion.rationale}
        </p>
      </li>
    </ul>
  </div>
);

const KeyPointBlock = ({
  keyPoint,
}: {
  keyPoint: {
    label: string;
    text?: string;
    subPoints?: Array<{ label: string; text: string }>;
  };
}) => (
  <li className="flex flex-col gap-4">
    <div className="flex items-center gap-4">
      <div className="w-3 h-3 rounded-full bg-slate-900" />
      <span className="text-xl font-bold text-[#1E293B]">{keyPoint.label} :</span>
    </div>

    {keyPoint.text && (
      <p className="ml-10 text-[19px] text-[#475569] leading-[1.8] font-medium">
        {keyPoint.text}
      </p>
    )}

    {keyPoint.subPoints && (
      <ul className="space-y-6 ml-10">
        {keyPoint.subPoints.map((subPoint, subIndex) => (
          <li key={subIndex} className="flex flex-col gap-2">
            {subPoint.label ? (
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                <span className="font-bold text-[19px] text-[#334155]">{subPoint.label} :</span>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
              </div>
            )}
            <p className="ml-10 text-[19px] text-[#475569] font-medium leading-[1.8]">
              {subPoint.text}
            </p>
          </li>
        ))}
      </ul>
    )}
  </li>
);

// ── Main component ────────────────────────────────────────────────────

export function StationDetailPS({ station, darkMode }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('station');

  const { metadata, studentPage, psPage, correctionPage } = station;

  const stationIdString = useMemo(
    () => `SDD ${metadata.sddNumber} (${metadata.stationNumber})`,
    [metadata.sddNumber, metadata.stationNumber]
  );

  const pageTitle = useMemo(() => {
    switch (activeTab) {
      case 'station':
        return metadata.sddTitle;
      case 'student':
        return "Pour l'étudiant";
      case 'ps':
        return 'Pour le PS';
      case 'correction':
        return 'Correction détaillée';
      default:
        return metadata.sddTitle;
    }
  }, [activeTab, metadata.sddTitle]);

  const tabClass = (tab: TabKey) =>
    `flex items-center gap-2.5 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all ${
      activeTab === tab
        ? darkMode
          ? 'bg-blue-900/40 border-blue-500/30 text-blue-300'
          : 'bg-[#EFF6FF] border-[#3B82F6]/30 text-[#1E40AF]'
        : darkMode
        ? 'bg-slate-800 border-slate-600 text-slate-400'
        : 'bg-[#F8FAFC] border-slate-200 text-[#64748B]'
    }`;

  return (
    <div className="font-sans antialiased text-[#1E293B]">
      {/* Tab pills */}
      <div className="flex flex-wrap gap-2.5 mb-8">
        <button onClick={() => setActiveTab('station')} className={tabClass('station')}>
          <BookOpen size={16} /> {stationIdString} : {metadata.sddTitle}
        </button>

        <button onClick={() => setActiveTab('student')} className={tabClass('student')}>
          <FileText size={16} /> {stationIdString} : Pour l'étudiant
        </button>

        <button onClick={() => setActiveTab('ps')} className={tabClass('ps')}>
          <User size={16} /> {stationIdString} : Pour le PS
        </button>

        <button onClick={() => setActiveTab('correction')} className={tabClass('correction')}>
          <GraduationCap size={16} /> {stationIdString} : Correction détaillée
        </button>
      </div>

      {/* Large pink title */}
      <h1 className="text-[52px] leading-[1.05] font-extrabold text-[#CC6C94] mb-6 tracking-[-0.03em] max-w-[980px]">
        {stationIdString} : {pageTitle}
      </h1>

      <div className="min-h-[500px]">
        {/* ── Station tab ── */}
        {activeTab === 'station' && (
          <div className="animate-in fade-in">
            <section>
              <SectionHeader title="Métadonnées de la station" />
              <MetaTable rows={metadata.stationMetadataRows} labelWidth="54%" valueWidth="46%" />
            </section>
          </div>
        )}

        {/* ── Student tab ── */}
        {activeTab === 'student' && (
          <div className="animate-in fade-in">
            <section>
              <SectionHeader title="Contexte et consignes" />

              <div className="space-y-10 px-2 text-[#2B2F36]">
                <div>
                  <h3 className="text-[22px] font-bold mb-4 text-[#2B2F36]">Contexte</h3>
                  <p className="text-[19px] leading-[1.75]">{studentPage.context}</p>
                </div>

                <div>
                  <h3 className="text-[22px] font-bold mb-4 text-[#2B2F36]">Consignes</h3>
                  <ul className="list-disc pl-8 space-y-3 text-[18px] leading-[1.7]">
                    {studentPage.tasksDo.map((task, index) => (
                      <li key={index}>{task}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[18px] leading-[1.7] mb-3">Vous ne devez pas :</p>
                  <ul className="list-disc pl-8 space-y-3 text-[18px] leading-[1.7]">
                    {studentPage.tasksDont.map((task, index) => (
                      <li key={index}>{task}</li>
                    ))}
                  </ul>
                </div>

                <p className="italic text-[18px] leading-[1.7]">{studentPage.explicitModeSentence}</p>
              </div>
            </section>
          </div>
        )}

        {/* ── PS tab ── */}
        {activeTab === 'ps' && (
          <div className="space-y-16 animate-in fade-in">
            <section>
              <SectionHeader title={psPage.patientScriptTitle} />

              <div className="space-y-12">
                {/* Patient frame */}
                <div>
                  <h3 className="text-[22px] font-bold mb-6 text-[#2B2F36]">
                    {psPage.patientFrameTitle}
                  </h3>
                  <MetaTable rows={psPage.patientFrameRows} labelWidth="36%" valueWidth="64%" />
                </div>

                {/* Acting */}
                <div>
                  <h3 className="text-[22px] font-bold mb-6 text-[#2B2F36]">
                    {psPage.actingTitle}
                  </h3>
                  <MetaTable rows={psPage.actingRows} labelWidth="20%" valueWidth="80%" />
                </div>

                {/* Protected info */}
                <div>
                  <h3 className="text-[22px] font-bold mb-6 text-[#2B2F36]">
                    {psPage.protectedInfoTitle}
                  </h3>

                  <div className="overflow-hidden border border-[#64748B] bg-white">
                    <table className="w-full border-collapse table-fixed">
                      <thead>
                        <tr className="bg-[#CBD5E1] text-[#0F172A]">
                          <th className="w-[26%] border border-[#64748B] px-4 py-4 text-left font-bold text-[15px] leading-[1.35]">
                            {psPage.protectedInfoHeaders[0]}
                          </th>
                          <th className="w-[37%] border border-[#64748B] px-4 py-4 text-left font-bold text-[15px] leading-[1.35]">
                            {psPage.protectedInfoHeaders[1]}
                          </th>
                          <th className="w-[37%] border border-[#64748B] px-4 py-4 text-left font-bold text-[15px] leading-[1.35]">
                            {psPage.protectedInfoHeaders[2]}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {psPage.protectedInfoRows.map((row, index) => (
                          <tr key={index} className="bg-[#E2E8F0]">
                            <td className="border border-[#64748B] px-4 py-4 text-[15px] font-bold text-[#1E293B] align-top leading-[1.5]">
                              {row.rubric}
                            </td>
                            <td className="border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-top leading-[1.6]">
                              {row.question}
                            </td>
                            <td className="border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-top leading-[1.6]">
                              {row.answer}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* Correction grid section */}
            <section>
              <SectionHeader title={psPage.correctionGridTitle} />
              <CorrectionGrid elements={psPage.extraElements} />
            </section>

            {/* Generic criteria section */}
            <section>
              <SectionHeader title={psPage.genericCriteriaTitle} />
              <ul className="list-disc pl-8 space-y-5 text-[18px] text-[#1E293B]">
                {psPage.genericCriteria.map((criterion, index) => (
                  <li key={index}>{criterion}</li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* ── Correction tab ── */}
        {activeTab === 'correction' && (
          <div className="space-y-16 animate-in fade-in">
            {/* General comment */}
            <section>
              <SectionHeader title={correctionPage.generalCommentTitle} />
              <div className="px-2">
                <div className="text-[18px] leading-[1.9] text-[#334155] whitespace-pre-wrap font-medium">
                  {correctionPage.generalComment}
                </div>
              </div>
            </section>

            {/* Criteria */}
            <section>
              <SectionHeader title={correctionPage.criteriaTitle} />
              <div className="space-y-12 px-2">
                {correctionPage.criteria.map((criterion) => (
                  <CriterionBlock key={criterion.id} criterion={criterion} />
                ))}
              </div>
            </section>

            {/* Key points */}
            <section>
              <SectionHeader title={correctionPage.keyPointsTitle} />
              <div className="px-2">
                <ul className="space-y-10">
                  {correctionPage.keyPoints.map((keyPoint, index) => (
                    <KeyPointBlock key={index} keyPoint={keyPoint} />
                  ))}
                </ul>
              </div>
            </section>

            {/* Example dialogue */}
            <section>
              <SectionHeader title={correctionPage.exampleDialogueTitle} />
              <div className="px-2">
                <div className="whitespace-pre-wrap font-sans text-[18px] leading-[1.9] text-[#334155] font-medium">
                  {correctionPage.exampleDialogue}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default StationDetailPS;
