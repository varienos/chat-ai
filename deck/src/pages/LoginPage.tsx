// import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogoDark from '../images/logo/logo-dark.svg';
import Logo from '../images/logo/logo.svg';
import { useAuth } from '../auth/AuthContext';
import { useState } from 'react';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Login failed');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-boxdark-2">
      <div className="w-full max-w-[1000px] rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-wrap items-center">
          <div className="hidden w-full xl:block xl:w-1/2">
            <div className="flex h-full items-center justify-center py-17.5 px-26">
              <Link to="/">
                <img className="hidden dark:block w-48" src={Logo} alt="Logo" />
                <img className="dark:hidden w-48" src={LogoDark} alt="Logo" />
              </Link>
            </div>
          </div>

          <div className="w-full border-stroke dark:border-strokedark xl:w-1/2 xl:border-l-2">
            <div className="w-full p-4 sm:p-12.5 xl:p-17.5">
              <span className="mb-1.5 block font-medium">Hoş geldiniz</span>
              <h2 className="mb-9 text-2xl font-bold text-black dark:text-white sm:text-title-xl2">
                Deck'e Giriş Yap
              </h2>

              <form onSubmit={handleSubmit}>
                {error && <div className="mb-4 text-center text-red-500">{error}</div>}
                <div className="mb-4">
                  <label className="mb-2.5 block font-medium text-black dark:text-white">
                    Kullanıcı Adı
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Kullanıcı adınızı girin"
                      className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                    />

                    <span className="absolute right-4 top-4">
                        {/* User Icon */}
                        <svg className="fill-current" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 11C13.7614 11 16 8.76142 16 6C16 3.23858 13.7614 1 11 1C8.23858 1 6 3.23858 6 6C6 8.76142 8.23858 11 11 11ZM11 2.5C12.9297 2.5 14.5 4.07031 14.5 6C14.5 7.92969 12.9297 9.5 11 9.5C9.07031 9.5 7.5 7.92969 7.5 6C7.5 4.07031 9.07031 2.5 11 2.5ZM18.5 21H3.5C3.15625 21 2.875 20.7188 2.875 20.375V18.5C2.875 15.3906 5.39062 12.875 8.5 12.875H13.5C16.6094 12.875 19.125 15.3906 19.125 18.5V20.375C19.125 20.7188 18.8438 21 18.5 21ZM4.375 19.5H17.625V18.5C17.625 16.2188 15.7812 14.375 13.5 14.375H8.5C6.21875 14.375 4.375 16.2188 4.375 18.5V19.5Z" fill=""/>
                        </svg>
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="mb-2.5 block font-medium text-black dark:text-white">
                    Şifre
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Şifrenizi girin"
                      className="w-full rounded-lg border border-stroke bg-transparent py-4 pl-6 pr-10 text-black outline-none focus:border-primary focus-visible:shadow-none dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                    />

                    <span className="absolute right-4 top-4">
                         {/* Lock Icon */}
                         <svg className="fill-current" width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16.1547 6.80626V5.91251C16.1547 3.16251 14.0922 0.825012 11.4172 0.618762C8.46719 0.412512 6.06094 2.77501 6.06094 5.63751V6.80626C4.71094 6.80626 3.63281 7.93126 3.63281 9.28126V17.2813C3.63281 18.6313 4.71094 19.7563 6.06094 19.7563H16.1547C17.5047 19.7563 18.5828 18.6313 18.5828 17.2813V9.28126C18.5828 7.93126 17.5047 6.80626 16.1547 6.80626ZM7.53906 5.63751C7.53906 3.60938 9.17656 1.97188 11.2047 1.97188C13.2328 1.97188 14.6766 3.60938 14.6766 5.63751V6.80626H7.53906V5.63751ZM17.1047 17.2813C17.1047 17.8219 16.6953 18.2782 16.1547 18.2782H6.06094C5.52031 18.2782 5.11094 17.8219 5.11094 17.2813V9.28126C5.11094 8.74063 5.52031 8.28438 6.06094 8.28438H16.1547C16.6953 8.28438 17.1047 8.74063 17.1047 9.28126V17.2813Z" fill=""/>
                            <path d="M11.1078 10.8906C10.1516 10.8906 9.37656 11.6656 9.37656 12.6219C9.37656 13.3281 9.78594 13.9375 10.3953 14.2375V15.675C10.3953 16.0844 10.6984 16.3875 11.1078 16.3875C11.5172 16.3875 11.8203 16.0844 11.8203 15.675V14.2375C12.4297 13.9375 12.8391 13.3281 12.8391 12.6219C12.8391 11.6656 12.0641 10.8906 11.1078 10.8906Z" fill=""/>
                        </svg>
                    </span>
                  </div>
                </div>

                <div className="mb-5">
                  <input
                    type="submit"
                    value="Giriş Yap"
                    className="w-full cursor-pointer rounded-lg border border-primary bg-primary p-4 text-white transition hover:bg-opacity-90"
                  />
                </div>

                <div className="mt-6 text-center">
                  <p className="text-sm text-bodydark2">
                    Yönetici hesabınızla giriş yapın
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
