import React, { useMemo, useState } from 'react';
import {
  FileText,
  User,
  GraduationCap,
  BookOpen,
  StickyNote,
  AlertTriangle,
  Image as ImageIcon,
} from 'lucide-react';
import type { PSSStationJSON } from './types';

type TabKey = 'station' | 'student' | 'pss' | 'correction';

type Props = {
  station: PSSStationJSON;
  darkMode: boolean;
};

export const StationDetailPSS: React.FC<Props> = ({ station, darkMode }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('station');

  const metadata = station.metadata;

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
      case 'pss':
        return 'Pour le PSS';
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
            onClick={() => setActiveTab('pss')}
            className={tabClass('pss')}
          >
            <User size={16} /> {stationIdString} : Pour le PSS
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
                            <td className="w-[36%] border border-[#64748B] px-4 py-4 text-[15px] font-bold text-[#1E293B] align-middle">
                              {row.label}
                            </td>
                            <td className="w-[64%] border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-middle">
                              {renderValue(row.value)}
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
              <div className="animate-in fade-in">
                <section>
                  <SectionHeader title="Contexte et consignes" />

                  <div className="space-y-10 px-2 text-[#2B2F36]">
                    <div>
                      <h3 className="text-[22px] font-bold mb-4 text-[#2B2F36]">Contexte</h3>
                      <div className="whitespace-pre-wrap text-[19px] leading-[1.75]">
                        {station.studentPage.context}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[22px] font-bold mb-4 text-[#2B2F36]">Consignes</h3>
                      <p className="text-[18px] mb-3">Vous devez :</p>
                      <ul className="list-disc pl-8 space-y-3 text-[18px] leading-[1.7]">
                        {station.studentPage.tasksDo.map((task, index) => (
                          <li key={index}>{task}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="text-[18px] leading-[1.7] mb-3">Vous ne devez pas :</p>
                      <ul className="list-disc pl-8 space-y-3 text-[18px] leading-[1.7]">
                        {station.studentPage.tasksDont.map((task, index) => (
                          <li key={index}>{task}</li>
                        ))}
                      </ul>
                    </div>

                    <p className="italic text-[18px] leading-[1.7]">
                      {station.studentPage.explicitModeSentence}
                    </p>

                    {station.studentPage.extraClinicalElements?.map((element, index) => (
                      <div key={index} className="space-y-4">
                        <h3 className="text-[22px] font-bold text-[#2B2F36]">{element.title}</h3>

                        {element.type === 'image-placeholder' && (
                          <div className="border border-slate-300 rounded-lg p-4 bg-slate-50 flex items-center gap-3 text-slate-600">
                            <ImageIcon size={20} />
                            <span>{element.content}</span>
                          </div>
                        )}

                        {element.type === 'bullet-section' && (
                          <ul className="list-disc pl-8 space-y-2 text-[17px] leading-[1.7]">
                            {element.items.map((item, itemIndex) => (
                              <li key={itemIndex}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  <ActionButtons />
                </section>
              </div>
            )}

            {activeTab === 'pss' && (
              <div className="space-y-16 animate-in fade-in">
                <section>
                  <SectionHeader title={station.pssPage.scriptTitle} />

                  <div className="space-y-12">
                    <div>
                      <h3 className="text-[22px] font-bold mb-6 text-[#2B2F36]">
                        {station.pssPage.patientFrameTitle}
                      </h3>

                      <div className="overflow-hidden border border-[#64748B] bg-white">
                        <table className="w-full border-collapse table-fixed">
                          <tbody>
                            {station.pssPage.patientFrameRows.map((row, index) => (
                              <tr key={index} className="bg-[#E2E8F0]">
                                <td className="w-[36%] border border-[#64748B] px-4 py-4 text-[15px] font-bold text-[#1E293B] align-top">
                                  {row.label}
                                </td>
                                <td className="w-[64%] border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-top">
                                  {renderValue(row.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[22px] font-bold mb-6 text-[#2B2F36]">
                        {station.pssPage.stationFlowTitle}
                      </h3>

                      <div className="overflow-hidden border border-[#64748B] bg-white">
                        <table className="w-full border-collapse table-fixed">
                          <tbody>
                            {station.pssPage.stationFlowRows.map((row, index) => (
                              <tr key={index} className="bg-[#E2E8F0]">
                                <td className="w-[28%] border border-[#64748B] px-4 py-4 text-[15px] font-bold text-[#1E293B] align-top">
                                  {row.label}
                                </td>
                                <td className="w-[72%] border border-[#64748B] px-4 py-4 text-[15px] text-[#1E293B] align-top">
                                  {renderValue(row.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <SectionHeader title={station.pssPage.correctionGridTitle} />

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
                            {station.pssPage.extraElements.map((row) => (
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
                    </div>

                    <div>
                      <SectionHeader title={station.pssPage.genericCriteriaTitle} />

                      <ul className="list-disc pl-8 space-y-5 text-[18px] text-[#1E293B]">
                        {station.pssPage.genericCriteria.map((criterion, index) => (
                          <li key={index}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <ActionButtons />
                </section>
              </div>
            )}

            {activeTab === 'correction' && (
              <div className="space-y-16 animate-in fade-in">
                <section>
                  <SectionHeader title={station.correctionPage.generalCommentTitle} />
                  <div className="px-2">
                    <div className="text-[18px] leading-[1.9] text-[#334155] whitespace-pre-wrap font-medium">
                      {station.correctionPage.generalComment}
                    </div>
                  </div>
                </section>

                <section>
                  <SectionHeader title={station.correctionPage.criteriaTitle} />

                  <div className="space-y-12 px-2">
                    {station.correctionPage.criteria.map((criterion) => (
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
                            <p className="ml-16 text-[19px] text-[#475569] font-medium leading-[1.85] whitespace-pre-wrap">
                              {criterion.rationale}
                            </p>
                          </li>
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionHeader title={station.correctionPage.keyPointsTitle} />

                  <div className="px-2">
                    <ul className="space-y-10">
                      {station.correctionPage.keyPoints.map((keyPoint, index) => (
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
                                  {subPoint.label ? (
                                    <div className="flex items-center gap-4">
                                      <div className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                                      <span className="font-bold text-[19px] text-[#334155]">
                                        {subPoint.label} :
                                      </span>
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
                      ))}
                    </ul>
                  </div>
                </section>

                <section>
                  <SectionHeader title={station.correctionPage.exampleDialogueTitle} />

                  <div className="px-2">
                    <div className="whitespace-pre-wrap font-sans text-[18px] leading-[1.9] text-[#334155] font-medium">
                      {station.correctionPage.exampleDialogue}
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

export default StationDetailPSS;
