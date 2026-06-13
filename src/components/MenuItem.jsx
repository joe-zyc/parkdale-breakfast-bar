import { useEffect, useState } from 'react';

export default function MenuItem({ item, isPhone }) {
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const shouldUseDropdownImage = Boolean(item.image && isPhone);

  useEffect(() => {
    if (!isPhone && isPhotoExpanded) {
      setIsPhotoExpanded(false);
    }
  }, [isPhone, isPhotoExpanded]);

  return (
    <article className={item.image ? 'menu-item with-image' : 'menu-item'}>
      {item.image && !shouldUseDropdownImage ? (
        <img className="menu-item-image" src={item.image} alt={item.name} loading="lazy" />
      ) : null}

      <div className="menu-item-content">
        <div className="menu-item-header">
          <h4>{item.name}</h4>
          <div className="menu-item-meta">
            <span>{item.price}</span>
            {shouldUseDropdownImage ? (
              <button
                className="photo-button"
                type="button"
                aria-expanded={isPhotoExpanded}
                aria-label={isPhotoExpanded ? `Hide ${item.name} photo` : `Show ${item.name} photo`}
                onClick={() => setIsPhotoExpanded((current) => !current)}
              >
                <span className="photo-button-icon" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {item.description ? <p>{item.description}</p> : null}

        {shouldUseDropdownImage ? (
          <div className={isPhotoExpanded ? 'photo-dropdown is-open' : 'photo-dropdown'}>
            <img src={item.image} alt={item.name} loading="lazy" />
          </div>
        ) : null}
      </div>
    </article>
  );
}
