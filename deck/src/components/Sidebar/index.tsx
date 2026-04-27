// import React, { useEffect, useRef, useState } from 'react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
// import SidebarLinkGroup from './SidebarLinkGroup';
import Logo from '../../images/logo/logo.svg';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const location = useLocation();
  const { pathname } = location;

  const trigger = useRef<any>(null);
  const sidebar = useRef<any>(null);

  const storedSidebarExpanded = localStorage.getItem('sidebar-expanded');
  const [sidebarExpanded] = useState(
    storedSidebarExpanded === null ? false : storedSidebarExpanded === 'true'
  );

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (
        !sidebarOpen ||
        sidebar.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  useEffect(() => {
    localStorage.setItem('sidebar-expanded', sidebarExpanded.toString());
    if (sidebarExpanded) {
      document.querySelector('body')?.classList.add('sidebar-expanded');
    } else {
      document.querySelector('body')?.classList.remove('sidebar-expanded');
    }
  }, [sidebarExpanded]);

  return (
    <aside
      ref={sidebar}
      className={`absolute left-0 top-0 z-9999 flex h-screen w-72.5 flex-col overflow-y-hidden bg-black duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* <!-- SIDEBAR HEADER --> */}
      <div className="flex items-center justify-between gap-2 px-6 py-5.5 lg:py-6.5">
        <NavLink to="/">
          <img className="w-32" src={Logo} alt="Logo" />
        </NavLink>

        <button
          ref={trigger}
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-controls="sidebar"
          aria-expanded={sidebarOpen}
          className="block lg:hidden"
        >
          <svg
            className="fill-current"
            width="20"
            height="18"
            viewBox="0 0 20 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M19 8.175H2.98748L9.36248 1.6875C9.69998 1.35 9.69998 0.825 9.36248 0.4875C9.02498 0.15 8.49998 0.15 8.16248 0.4875L0.399976 8.3625C0.0624756 8.7 0.0624756 9.225 0.399976 9.5625L8.16248 17.4375C8.31248 17.5875 8.53748 17.7 8.76248 17.7C8.98748 17.7 9.17498 17.625 9.36248 17.475C9.69998 17.1375 9.69998 16.6125 9.36248 16.275L3.02498 9.8625H19C19.45 9.8625 19.825 9.4875 19.825 9.0375C19.825 8.55 19.45 8.175 19 8.175Z"
              fill=""
            />
          </svg>
        </button>
      </div>
      {/* <!-- SIDEBAR HEADER --> */}

      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto duration-300 ease-linear">
        {/* <!-- Sidebar Menu --> */}
        <nav className="mt-5 py-4 px-4 lg:mt-9 lg:px-6">
          {/* <!-- Menu Group --> */}
          <div>
            <h3 className="mb-4 ml-4 text-sm font-semibold text-bodydark2">
              MENU
            </h3>

            <ul className="mb-6 flex flex-col gap-1.5">
              {/* <!-- Menu Item Dashboard --> */}
              <li>
                <NavLink
                  to="/dashboard"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('dashboard') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M16.5 6.75H10.5C10.1625 6.75 9.825 6.4125 9.825 6V1.5C9.825 1.05 10.1625 0.75 10.5 0.75H16.5C16.9125 0.75 17.25 1.05 17.25 1.5V6C17.25 6.4125 16.9125 6.75 16.5 6.75ZM11.325 5.25H15.75V2.25H11.325V5.25Z"
                      fill=""
                    />
                    <path
                      d="M7.5 16.5H1.5C1.0875 16.5 0.75 16.1625 0.75 15.75V11.25C0.75 10.8 1.0875 10.5 1.5 10.5H7.5C7.9125 10.5 8.25 10.8 8.25 11.25V15.75C8.25 16.1625 7.9125 16.5 7.5 16.5ZM2.25 15H6.75V12H2.25V15Z"
                      fill=""
                    />
                    <path
                      d="M7.5 9H1.5C1.0875 9 0.75 8.6625 0.75 8.25V1.5C0.75 1.05 1.0875 0.75 1.5 0.75H7.5C7.9125 0.75 8.25 1.05 8.25 1.5V8.25C8.25 8.6625 7.9125 9 7.5 9ZM2.25 7.5H6.75V2.25H2.25V7.5Z"
                      fill=""
                    />
                    <path
                      d="M16.5 17.25H10.5C10.1625 17.25 9.825 16.9125 9.825 16.5V10.5C9.825 10.0875 10.1625 9.75 10.5 9.75H16.5C16.9125 9.75 17.25 10.0875 17.25 10.5V16.5C17.25 16.9125 16.9125 17.25 16.5 17.25ZM11.325 15.75H15.75V11.25H11.325V15.75Z"
                      fill=""
                    />
                  </svg>
                  Dashboard
                </NavLink>
              </li>
              {/* <!-- Menu Item Dashboard --> */}

              {/* <!-- Menu Item Sessions --> */}
              <li>
                <NavLink
                  to="/sessions"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('sessions') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15.7499 2.1375H2.24988C1.40613 2.1375 0.749878 2.8125 0.749878 3.6375V14.1375C0.749878 14.9625 1.40613 15.6375 2.24988 15.6375H15.7499C16.5936 15.6375 17.2499 14.9625 17.2499 14.1375V3.6375C17.2499 2.8125 16.5936 2.1375 15.7499 2.1375ZM15.7499 14.1375H2.24988V3.6375H15.7499V14.1375Z"
                      fill=""
                    />
                    <path
                      d="M4.12488 6.375H13.8749C14.0624 6.375 14.2499 6.225 14.2499 6C14.2499 5.775 14.0624 5.625 13.8749 5.625H4.12488C3.93738 5.625 3.74988 5.775 3.74988 6C3.74988 6.225 3.93738 6.375 4.12488 6.375Z"
                      fill=""
                    />
                    <path
                      d="M4.12488 8.625H10.1249C10.3124 8.625 10.4999 8.475 10.4999 8.25C10.4999 8.025 10.3124 7.875 10.1249 7.875H4.12488C3.93738 7.875 3.74988 8.025 3.74988 8.25C3.74988 8.475 3.93738 8.625 4.12488 8.625Z"
                      fill=""
                    />
                  </svg>
                  Sessions
                </NavLink>
              </li>
              {/* <!-- Menu Item Sessions --> */}

              {/* <!-- Menu Item Chat --> */}
              <li>
                <NavLink
                  to="/chat"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('chat') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14.9063 2.925H3.09375C2.16562 2.925 1.40625 3.68438 1.40625 4.6125V16.875C1.40625 17.3812 1.99687 17.6625 2.39062 17.2688L5.20312 14.4563H14.9063C15.8344 14.4563 16.5938 13.6969 16.5938 12.7688V4.6125C16.5938 3.68438 15.8344 2.925 14.9063 2.925ZM15.1875 12.7688C15.1875 12.9375 15.0469 13.0781 14.9063 13.0781H5.20312C5.03437 13.0781 4.86562 13.1344 4.75312 13.2469L3.09375 14.9063V4.6125C3.09375 4.44375 3.23437 4.30312 3.375 4.30312H14.9063C15.075 4.30312 15.2156 4.44375 15.2156 4.6125V12.7688H15.1875Z"
                      fill=""
                    />
                  </svg>
                  Chat
                </NavLink>
              </li>
              {/* <!-- Menu Item Chat --> */}

              {/* <!-- Menu Item API Docs --> */}
              <li>
                <NavLink
                  to="/api-docs"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('api-docs') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5.25 1.5H12.75C13.575 1.5 14.25 2.175 14.25 3V15C14.25 15.825 13.575 16.5 12.75 16.5H5.25C4.425 16.5 3.75 15.825 3.75 15V3C3.75 2.175 4.425 1.5 5.25 1.5ZM5.25 3V15H12.75V3H5.25ZM6.75 5.25H11.25V6.75H6.75V5.25ZM6.75 8.25H11.25V9.75H6.75V8.25ZM6.75 11.25H9.75V12.75H6.75V11.25Z"
                      fill=""
                    />
                  </svg>
                  API Docs
                </NavLink>
              </li>
              {/* <!-- Menu Item API Docs --> */}

              {/* <!-- Menu Item Knowledge Base --> */}
              <li>
                <NavLink
                  to="/knowledge"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('knowledge') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15.75 0H5.25C4.425 0 3.75 0.675 3.75 1.5V3H2.25C1.425 3 0.75 3.675 0.75 4.5V16.5C0.75 17.325 1.425 18 2.25 18H12.75C13.575 18 14.25 17.325 14.25 16.5V15H15.75C16.575 15 17.25 14.325 17.25 13.5V1.5C17.25 0.675 16.575 0 15.75 0ZM12.75 16.5H2.25V4.5H12.75V16.5ZM15.75 13.5H14.25V4.5C14.25 3.675 13.575 3 12.75 3H5.25V1.5H15.75V13.5Z"
                      fill=""
                    />
                    <path
                      d="M4.5 7.5H10.5V9H4.5V7.5Z"
                      fill=""
                    />
                    <path
                      d="M4.5 10.5H10.5V12H4.5V10.5Z"
                      fill=""
                    />
                  </svg>
                  Knowledge Base
                </NavLink>
              </li>
              {/* <!-- Menu Item Knowledge Base --> */}

              {/* <!-- Menu Item Settings --> */}
              <li>
                <NavLink
                  to="/settings"
                  className={`group relative flex items-center gap-2.5 rounded-sm py-2 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-graydark dark:hover:bg-meta-4 ${
                    pathname.includes('settings') && 'bg-graydark dark:bg-meta-4'
                  }`}
                >
                  <svg
                    className="fill-current"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M19.14 12.94C19.18 12.64 19.2 12.33 19.2 12C19.2 11.68 19.18 11.36 19.13 11.06L21.16 9.48C21.34 9.34 21.39 9.07 21.28 8.87L19.36 5.55C19.24 5.33 18.99 5.26 18.77 5.33L16.38 6.29C15.88 5.91 15.35 5.59 14.76 5.35L14.4 2.81C14.36 2.57 14.16 2.4 13.92 2.4H10.08C9.84 2.4 9.65 2.57 9.61 2.81L9.25 5.35C8.66 5.59 8.12 5.92 7.63 6.29L5.24 5.33C5.02 5.25 4.77 5.33 4.65 5.55L2.74 8.87C2.62 9.08 2.66 9.34 2.86 9.48L4.89 11.06C4.84 11.36 4.8 11.69 4.8 12C4.8 12.31 4.82 12.64 4.87 12.94L2.84 14.52C2.66 14.66 2.61 14.93 2.72 15.13L4.64 18.45C4.76 18.67 5.01 18.74 5.23 18.67L7.62 17.71C8.12 18.09 8.65 18.41 9.24 18.65L9.6 21.19C9.65 21.43 9.84 21.6 10.08 21.6H13.92C14.16 21.6 14.36 21.43 14.39 21.19L14.75 18.65C15.34 18.41 15.88 18.09 16.37 17.71L18.76 18.67C18.98 18.75 19.23 18.67 19.35 18.45L21.27 15.13C21.39 14.91 21.34 14.66 21.15 14.52L19.14 12.94ZM12 15.6C10.02 15.6 8.4 13.98 8.4 12C8.4 10.02 10.02 8.4 12 8.4C13.98 8.4 15.6 10.02 15.6 12C15.6 13.98 13.98 15.6 12 15.6Z"
                      fill=""
                    />
                  </svg>
                  Settings
                </NavLink>
              </li>
              {/* <!-- Menu Item Settings --> */}
            </ul>
          </div>
        </nav>
        {/* <!-- Sidebar Menu --> */}

        <div className="mt-auto px-6 py-4 text-center">
          <p className="text-xs text-bodydark2">
            Developed by{' '}
            <a href="https://varien.software" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              varien.software
            </a>
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
