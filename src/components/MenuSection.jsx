import MenuItem from './MenuItem.jsx';

export default function MenuSection({ section, isPhone }) {
  const hasSubsections = Array.isArray(section.subsections) && section.subsections.length > 0;

  return (
    <section className="menu-section" id={section.id} role="tabpanel" aria-labelledby={`${section.id}-heading`}>
      <div className="menu-section-heading">
        <h3 id={`${section.id}-heading`}>{section.title}</h3>
      </div>

      {hasSubsections ? (
        <div className="menu-subsections">
          {section.subsections.map((subsection) => (
            <div className="menu-subsection" key={subsection.id ?? subsection.title}>
              <div className="menu-subsection-heading">
                <h4>{subsection.title}</h4>
                {subsection.description ? <p>{subsection.description}</p> : null}
              </div>

              <div className="menu-items">
                {subsection.items.map((item) => (
                  <MenuItem key={`${section.id}-${subsection.id ?? subsection.title}-${item.name}`} item={item} isPhone={isPhone} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="menu-items">
          {(section.items ?? []).map((item) => (
            <MenuItem key={`${section.id}-${item.name}`} item={item} isPhone={isPhone} />
          ))}
        </div>
      )}
    </section>
  );
}
