import React, { useMemo, useState } from 'react';
import type { SansPSStationJSON } from './types';

type IconProps = { size?: number; strokeWidth?: number; className?: string };
function BookOpen({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>; }
function FileText({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
function User({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>; }
function GraduationCap({ size = 16, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>; }
function StickyNote({ size = 18, strokeWidth: sw = 2, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden="true"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><polyline points="15 3 15 9 21 9"/></svg>; }
function AlertTriangle({ size = 18, strokeWidth: sw = 2, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }
function ChevronDown({ size = 15, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>; }
function ChevronUp({ size = 15, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>; }
function FileSearch({ size = 24, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11" cy="15" r="2"/><line x1="13" y1="17" x2="15" y2="19"/></svg>; }
function FlaskConical({ size = 24, className }: IconProps) { return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="M10 2v7.31l-5.47 8.49a2 2 0 0 0 1.71 3H17.76a2 2 0 0 0 1.71-3L14 9.31V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/></svg>; }

type TabKey = 'station' | 'student' | 'examiner' | 'correction';

interface StationDetailSansPSProps {
  station: SansPSStationJSON;
  darkMode: boolean;
}

export const StationDetailSansPS: React.FC<StationDetailSansPSProps> = ({ station, darkMode }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('station');
  const [showMoreReading, setShowMoreReading] = useState(false);

  const metadata = station.metadata;

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
      case 'examiner':
        return "Pour l'examinateur";
      case 'correction':
        return 'Correction détaillée';
      default:
        return metadata.sddTitle;
    }
  }, [activeTab, metadata.sddTitle]);

  const readingTime = useMemo(() => {
    switch (activeTab) {
      case 'correction':
        return '10 minutes de lecture';
      case 'examiner':
        return '2 minutes de lecture';
      case 'station':
      case 'student':
      default:
        return '1 minutes de lecture';
    }
  }, [activeTab]);

  const SectionHeader = ({ title }: { title: string }) => (
    <div className="bg-[#F1F5F9] border-l-[4px] border-[#64748B] px-4 py-3 mb-8 rounded-[2px]">
      <h2 className="text-[24px] font-bold text-[#0F172A] tracking-tight">{title}</h2>
    </div>
  );

  const ActionButtons = () => (
    <div className="flex justify-end gap-8 mt-12 pt-4 text-[#4A5568] font-semibold text-sm">
      <button className="flex items-center gap-2 hover:text-slate-800 transition-colors">
        <StickyNote size={18} strokeWidth={1.8} />
        Écrire une note
      </button>
      <button className="flex items-center gap-2 hover:text-slate-800 transition-colors">
        <AlertTriangle size={18} strokeWidth={1.8} />
        Signaler une erreur
      </button>
    </div>
  );

  const renderStationMetadataValue = (value: string | string[]) => {
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

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans antialiased text-[#1E293B]">
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pt-5 pb-10 md:px-6">
        <div className="flex flex-wrap gap-2.5 mb-8">
          <button
            onClick={() => setActiveTab('station')}
            className={tabClass('station')}
          >
            <BookOpen size={16} /> {stationIdString} : {metadata.sddTitle}
          </button>

          <button
            onClick={() => setActiveTab('student')}
            className={tabClass('student')}
          >
            <FileText size={16} /> {stationIdString} : Pour l'étudiant
          </button>

          <button
            onClick={() => setActiveTab('examiner')}
            className={tabClass('examiner')}
          >
            <User size={16} /> {stationIdString} : Pour l'examinateur
          </button>

          <button
            onClick={() => setActiveTab('correction')}
            className={tabClass('correction')}
          >
            <GraduationCap size={16} /> {stationIdString} : Correction détaillée
          </button>
        </div>

        <div>
          <h1 className="text-[52px] leading-[1.05] font-extrabold text-[#CC6C94] mb-6 tracking-[-0.03em] max-w-[980px]">
            {stationIdString} : {pageTitle}
          </h1>

          <div className="bg-[#F1F5F9] rounded-[4px] px-5 py-4 mb-5 min-h-[86px]">
            <div className="flex flex-col items-start gap-4">
              <span className="text-[#475569] font-medium text-[15px]">{readingTime}</span>

              <button
                onClick={() => setShowMoreReading((prev) => !prev)}
                className="flex items-center gap-1.5 text-[#475569] text-[13px] font-semibold hover:text-slate-800 transition-colors"
              >
                Afficher plus {showMoreReading ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          <div className="min-h-[500px]">
            {activeTab === 'station' && (
              <div className="animate-in fade-in">
                <section>
                  <SectionHeader title="Métadonnées de la station" />

                  <div className="overflow-hidden border border-[#64748B] bg-white">
                    <table className="w-full border-collapse table-fixed">
                      <tbody>
                        {metadata.stationMetadataRows.map((row, index) => (
                          <tr key={index} className="bg-[#E2E8F0]">
                            <td className="w-[54%] border border-[#64748B] px-8 py-4 text-[15px] font-bold text-[#1E293B] align-middle">
                              {row.label}
                            </td>
                            <td className="w-[46%] border border-[#64748B] px-8 py-4 text-[15px] text-[#1E293B] align-middle">
                              {renderStationMetadataValue(row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ActionButtons />
                </section>
              </div>
            )}

            {activeTab === 'student' && (
              <div className="space-y-16">
                <section>
                  <SectionHeader title="Contexte et consignes" />

                  <div className="space-y-10 px-2 text-[#475569]">
                    <div>
                      <h3 className="text-2xl font-bold mb-5 text-[#334155]">Contexte</h3>
                      <p className="text-[19px] leading-[1.7]">{station.studentPage.context}</p>
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold mb-5 text-[#334155]">Consignes</h3>

                      <ul className="space-y-6">
                        <li className="flex flex-col gap-4 text-[19px]">
                          <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-slate-900" />
                            <span className="font-bold text-[#1E293B]">Vous devez :</span>
                          </div>

                          <ul className="space-y-4 pl-12">
                            {station.studentPage.tasksDo.map((task, index) => (
                              <li key={index} className="flex gap-4 items-start">
                                <span className="text-slate-300 text-2xl leading-none mt-[-2px]">○</span>
                                <span>{task}</span>
                              </li>
                            ))}
                          </ul>
                        </li>

                        <li className="flex flex-col gap-4 text-[19px]">
                          <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-slate-900" />
                            <span className="font-bold text-[#1E293B]">Vous ne devez pas :</span>
                          </div>

                          <ul className="space-y-4 pl-12">
                            {station.studentPage.tasksDont.map((task, index) => (
                              <li key={index} className="flex gap-4 items-start">
                                <span className="text-slate-300 text-2xl leading-none mt-[-2px]">○</span>
                                <span>{task}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {station.studentPage.extraClinicalElements && station.studentPage.extraClinicalElements.length > 0 && (
                  <section>
                    <SectionHeader title="Éléments supplémentaires" />

                    <div className="space-y-16 px-2">
                      {station.studentPage.extraClinicalElements.map((element, index) => (
                        <div key={index} className="space-y-6">
                          <h3 className="text-2xl font-bold text-[#1E293B] flex items-center gap-3">
                            {element.type === 'table' ? (
                              <FlaskConical className="text-[#3B82F6]" size={24} />
                            ) : (
                              <FileSearch className="text-[#3B82F6]" size={24} />
                            )}
                            {element.title}
                          </h3>

                          {element.type === 'report' ? (
                            <div className="bg-[#FBFCFE] border border-slate-100 rounded-xl p-8">
                              <pre className="whitespace-pre-wrap font-sans text-lg text-[#475569] italic">
                                {element.content}
                              </pre>
                            </div>
                          ) : element.type === 'table' ? (
                            <div className="overflow-hidden border border-slate-200 rounded-xl shadow-sm">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-[#F8FAFC] text-[#475569] border-b border-slate-200">
                                    {element.headers.map((header, idx) => (
                                      <th
                                        key={idx}
                                        className="py-4 px-6 font-bold uppercase text-xs tracking-wider"
                                      >
                                        {header}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {element.rows.map((row, rowIndex) => (
                                    <tr
                                      key={rowIndex}
                                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                                    >
                                      {row.map((cell, cellIndex) => (
                                        <td
                                          key={cellIndex}
                                          className={`py-4 px-6 text-[17px] ${
                                            cellIndex === 0
                                              ? 'font-bold text-[#1E293B]'
                                              : 'text-[#475569]'
                                          }`}
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : element.type === 'bullet-section' ? (
                            <ul className="list-disc pl-8 space-y-3 text-[18px] text-[#475569]">
                              {element.items.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <ActionButtons />
              </div>
            )}

            {activeTab === 'examiner' && (
              <div className="space-y-16 animate-in fade-in">
                <section>
                  <SectionHeader title="Grille de correction" />

                  <div className="overflow-hidden border border-slate-400 bg-white mb-12">
                    <table className="w-full border-collapse table-fixed">
                      <thead>
                        <tr className="bg-[#CBD5E1] text-[#0F172A]">
                          <th className="w-[76px] border border-slate-400 px-3 py-3"></th>
                          <th className="border border-slate-400 px-4 py-3 text-left align-bottom font-bold text-[15px]">
                            Critères cibles
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
                        {station.script.extraElements.map((row) => (
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
                </section>

                <section>
                  <SectionHeader title="Critères d'évaluation génériques" />

                  <ul className="list-disc pl-8 space-y-5 text-[18px] text-[#1E293B]">
                    {station.script.genericCriteria.map((criterion, index) => (
                      <li key={index}>{criterion}</li>
                    ))}
                  </ul>

                  <ActionButtons />
                </section>
              </div>
            )}

            {activeTab === 'correction' && (
              <div className="space-y-16 animate-in fade-in">
                <section>
                  <SectionHeader title="Commentaire général de la station" />
                  <div className="px-2">
                    <div className="text-[18px] leading-[1.9] text-[#334155] whitespace-pre-wrap font-medium">
                      {station.teaching.generalComment}
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader title="Correction par critère" />

                  <div className="space-y-12 px-2">
                    {station.criteria.map((criterion) => (
                      <div key={criterion.id} className="space-y-8">
                        <h4 className="text-2xl font-bold text-[#1E293B]">
                          Critère {criterion.id}
                        </h4>

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
                              <span className="font-bold text-[19px] text-[#334155]">
                                Correction :
                              </span>
                            </div>
                            <p className="ml-16 text-[19px] text-[#475569] font-medium leading-[1.85]">
                              {criterion.rationale}
                            </p>
                          </li>
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionHeader title="Points clés" />

                  <div className="px-2">
                    <ul className="space-y-10">
                      {station.teaching.keyPoints.map((keyPoint, index) => (
                        <li key={index} className="flex flex-col gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-3 h-3 rounded-full bg-slate-900" />
                            <span className="text-xl font-bold text-[#1E293B]">
                              {keyPoint.label} :
                            </span>
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
                                  <div className="flex items-center gap-4">
                                    <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                                    <span className="font-bold text-[19px] text-[#334155]">
                                      {subPoint.label} :
                                    </span>
                                  </div>
                                  <p className="ml-10 text-[19px] text-[#475569] font-medium leading-[1.8]">
                                    {subPoint.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section>
                  <SectionHeader title="Exemple de conversation" />

                  <div className="px-2">
                    <div className="whitespace-pre-wrap font-sans text-[18px] leading-[1.9] text-[#334155] font-medium">
                      {station.teaching.exampleDialogue}
                    </div>
                  </div>

                  <ActionButtons />
                </section>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default StationDetailSansPS;
