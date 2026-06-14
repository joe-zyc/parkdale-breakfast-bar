export default function MenuNav({ sections, activeSectionId, onSelectSection }) {
  return (
    <div className="menu-nav" role="tablist" aria-label="Menu sections">
      {sections.map((section) => (
        <button
          key={section.id}
          className={section.id === activeSectionId ? 'is-active' : undefined}
          type="button"
          role="tab"
          aria-selected={section.id === activeSectionId}
          onClick={() => onSelectSection(section.id)}
        >
          {section.title}
        </button>
      ))}
    </div>
  );
}
