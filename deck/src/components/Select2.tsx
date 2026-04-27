import Select, { StylesConfig, SingleValue } from 'react-select';
import { useEffect, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Select2Props {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  isSearchable?: boolean;
  isDisabled?: boolean;
  className?: string;
}

function useIsDark() {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem('color-theme');
      if (stored) return JSON.parse(stored) === 'dark';
    } catch {}
    return document.body.classList.contains('dark');
  });
  useEffect(() => {
    const sync = () => setDark(document.body.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function getStyles(dark: boolean): StylesConfig<SelectOption, false> {
  // Birebir TailAdmin input renkleri
  const bg = dark ? '#313D4A' : '#EFF4FB';       // dark:bg-meta-4 / bg-gray
  const border = dark ? '#2E3A47' : '#E2E8F0';   // dark:border-strokedark / border-stroke
  const text = dark ? '#ffffff' : '#1C2434';      // dark:text-white / text-black
  const menuBg = dark ? '#24303F' : '#ffffff';    // dark:bg-boxdark / bg-white
  const hoverBg = dark ? '#313D4A' : '#EFF4FB';   // dark:bg-meta-4 / bg-gray

  return {
    control: (base, state) => ({
      ...base,
      backgroundColor: bg,
      borderColor: state.isFocused ? '#F40079' : border,
      borderWidth: '1px',
      borderRadius: '0.25rem',
      minHeight: '46px',
      padding: '0 2px',
      fontSize: '1rem',
      boxShadow: 'none',
      outline: state.isFocused ? 'none' : 'none',
      '&:hover': { borderColor: state.isFocused ? '#F40079' : border },
    }),
    singleValue: (base) => ({ ...base, color: text, fontSize: '1rem' }),
    input: (base) => ({ ...base, color: text, fontSize: '1rem', margin: 0, padding: 0 }),
    placeholder: (base) => ({ ...base, color: dark ? '#AEB7C0' : '#64748B', fontSize: '1rem' }),
    valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
    menu: (base) => ({
      ...base,
      backgroundColor: menuBg,
      border: `1px solid ${border}`,
      borderRadius: '0.25rem',
      zIndex: 50,
      marginTop: '4px',
      boxShadow: dark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)',
    }),
    menuList: (base) => ({ ...base, padding: '4px 0' }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? '#F40079' : state.isFocused ? hoverBg : 'transparent',
      color: state.isSelected ? '#fff' : text,
      fontSize: '0.875rem',
      padding: '8px 12px',
      cursor: 'pointer',
      '&:active': { backgroundColor: '#F40079', color: '#fff' },
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? '#F40079' : (dark ? '#AEB7C0' : '#64748B'),
      padding: '8px',
      '&:hover': { color: '#F40079' },
    }),
  };
}

export default function Select2({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = 'Seçiniz...',
  isSearchable = true,
  isDisabled = false,
  className,
}: Select2Props) {
  const dark = useIsDark();
  const styles = getStyles(dark);

  const selectedOption = value
    ? options.find((o) => o.value === value)
    : defaultValue
    ? options.find((o) => o.value === defaultValue)
    : undefined;

  return (
    <Select
      key={dark ? 'dark' : 'light'}
      options={options}
      value={selectedOption}
      defaultValue={selectedOption}
      onChange={(opt: SingleValue<SelectOption>) => {
        if (opt && onChange) onChange(opt.value);
      }}
      placeholder={placeholder}
      isSearchable={isSearchable}
      isDisabled={isDisabled}
      styles={styles}
      className={className}
    />
  );
}
