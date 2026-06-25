import React, { useState, useEffect, createContext, useContext } from 'react';
import { 
  Home, Users, Calendar, Clock, DollarSign, FileText, 
  Settings, Plus, Edit2, Trash2, Menu, AlertCircle, 
  CheckCircle, ArrowLeftCircle, LogOut, Coffee, Cloud 
} from 'lucide-react';

// ==========================================
// CONFIGURAÇÃO FIREBASE
// ==========================================
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, addDoc, getDocs, updateDoc, deleteDoc, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDHtu6tBZ_ZZPyepzaJqkR2UG0peqpFv9c",
  authDomain: "controle-pro-meta.firebaseapp.com",
  projectId: "controle-pro-meta",
  storageBucket: "controle-pro-meta.firebasestorage.app",
  messagingSenderId: "69234664808",
  appId: "1:69234664808:web:b5116269c683a4ab0522dd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbFirestore = getFirestore(app);

// ==========================================
// UTILS & HELPER FUNCTIONS
// ==========================================
const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

const formatarTempo = (minutos) => {
  if (isNaN(minutos) || minutos < 0) minutos = 0;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

const getTodayLocal = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const calculateWeeklyHours = (jornada) => {
  if (!jornada) return 0;
  let totalMins = 0;
  const days = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  days.forEach(day => {
    const config = jornada[day];
    if (config && config.ativo) {
      const start = timeToMinutes(config.entrada);
      const end = timeToMinutes(config.saida);
      const interval = timeToMinutes(config.intervalo || "00:00");
      if (end > start) totalMins += (end - start - interval);
    }
  });
  return totalMins / 60;
};

const calculateMonthlyHours = (weeklyHours) => {
  if (weeklyHours === 0) return 220; // Fallback padrão caso não haja jornada
  return (weeklyHours * 30) / 7;
};

// ==========================================
// FIRESTORE CLOUD SERVICE
// ==========================================
const CloudService = {
  getFuncionarios: async (uid, isAdmin, email) => {
    if (isAdmin) {
      const q = query(collection(dbFirestore, 'funcionarios'), where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const q = query(collection(dbFirestore, 'funcionarios'), where('emailAcesso', '==', email));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  },
  saveFuncionario: async (uid, func) => await addDoc(collection(dbFirestore, 'funcionarios'), { ...func, userId: uid }),
  updateFuncionario: async (id, data) => await updateDoc(doc(dbFirestore, 'funcionarios', id), data),
  deleteFuncionario: async (id) => await deleteDoc(doc(dbFirestore, 'funcionarios', id)),
  
  getJornadas: async (uid, isAdmin, funcId) => {
    if (isAdmin) {
      const q = query(collection(dbFirestore, 'jornadas'), where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const q = query(collection(dbFirestore, 'jornadas'), where('funcionarioId', '==', funcId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  },
  saveJornada: async (uid, funcId, jornadaData) => await setDoc(doc(dbFirestore, 'jornadas', funcId), { ...jornadaData, funcionarioId: funcId, userId: uid }),
  
  getRegistrosPonto: async (uid, isAdmin, funcId) => {
    if (isAdmin) {
      const q = query(collection(dbFirestore, 'pontos'), where('userId', '==', uid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const q = query(collection(dbFirestore, 'pontos'), where('funcionarioId', '==', funcId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  },
  saveRegistroPonto: async (adminUid, registro) => await addDoc(collection(dbFirestore, 'pontos'), { ...registro, userId: adminUid }),
  updateRegistroPonto: async (id, data) => await updateDoc(doc(dbFirestore, 'pontos', id), data),
  deleteRegistroPonto: async (id) => await deleteDoc(doc(dbFirestore, 'pontos', id))
};

// ==========================================
// CONTEXT & STATE MANAGEMENT
// ==========================================
const AppContext = createContext();

const AppProvider = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataSyncing, setDataSyncing] = useState(false);
  const [db, setDb] = useState({ funcionarios: [], jornadas: [], pontos: [] });

  // COLOQUE O SEU E-MAIL ADMINISTRATIVO REAL AQUI
  const GESTOR_EMAIL = 'maxmendes@outlook.com'; 
  const isAdmin = currentUser?.email === GESTOR_EMAIL;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadCloudData = async () => {
      if (!currentUser) return;
      setDataSyncing(true);
      try {
        const uid = currentUser.uid;
        const email = currentUser.email;

        const funcs = await CloudService.getFuncionarios(uid, isAdmin, email);
        const activeFuncId = !isAdmin && funcs.length > 0 ? funcs[0].id : '';

        const jorna = await CloudService.getJornadas(uid, isAdmin, activeFuncId);
        const pts = await CloudService.getRegistrosPonto(uid, isAdmin, activeFuncId);
        
        setDb({ funcionarios: funcs, jornadas: jorna, pontos: pts });
      } catch (error) {
        console.error("Erro ao sincronizar nuvem:", error);
        showToast("Erro ao conectar com a nuvem.", "error");
      } finally {
        setDataSyncing(false);
      }
    };
    loadCloudData();
  }, [currentUser, refreshTrigger, isAdmin]);

  const login = async (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = async () => { await signOut(auth); setCurrentRoute('dashboard'); };
  const refreshData = () => setRefreshTrigger(prev => prev + 1);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <AppContext.Provider value={{ 
      currentRoute, setCurrentRoute, db, refreshData, showToast,
      currentUser, login, logout, authLoading, dataSyncing, isAdmin
    }}>
      {children}
      {toast && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white flex items-center space-x-2 z-50 transition-all
          ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
          {toast.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <span>{toast.message}</span>
        </div>
      )}
    </AppContext.Provider>
  );
};

const useAppContext = () => useContext(AppContext);

// ==========================================
// COMPONENTES DE INTERFACE BASE
// ==========================================
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${className}`}>{children}</div>
);

const Button = ({ children, variant = 'primary', icon: Icon, onClick, type = 'button', className = '', disabled=false }) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent disabled:bg-indigo-400',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 disabled:opacity-50',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent'
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 text-sm ${variants[variant]} ${className}`}>
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
};

const Input = ({ label, type = 'text', value, onChange, required, className = '' }) => (
  <div className={`flex flex-col space-y-1 ${className}`}>
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <input type={type} value={value} onChange={onChange} required={required} className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white" />
  </div>
);

const Select = ({ label, value, onChange, options, className = '' }) => (
  <div className={`flex flex-col space-y-1 ${className}`}>
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <select value={value} onChange={onChange} className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white">
      {options.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

// ==========================================
// MÓDULO: PONTO DO COLABORADOR (MOBILE-FIRST)
// ==========================================
const PontoColaborador = () => {
  const { db, refreshData, showToast } = useAppContext();
  const [horaAtual, setHoraAtual] = useState(new Date());
  const [isSaving, setIsSaving] = useState(false);
  const hoje = getTodayLocal();

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const colaborador = db.funcionarios[0]; 
  const pontoHoje = db.pontos.find(p => p.funcionarioId === colaborador?.id && p.data === hoje);

  const handleBaterPontoRapido = async () => {
    if (!colaborador) return showToast('Perfil de funcionário não encontrado.', 'error');
    setIsSaving(true);

    let novosRegistros = {
      entrada1: pontoHoje?.entrada1 || '',
      saida1: pontoHoje?.saida1 || '',
      entrada2: pontoHoje?.entrada2 || '',
      saida2: pontoHoje?.saida2 || '',
      obs: pontoHoje?.obs || ''
    };

    const horaFormatada = `${String(horaAtual.getHours()).padStart(2, '0')}:${String(horaAtual.getMinutes()).padStart(2, '0')}`;

    if (!novosRegistros.entrada1) {
      novosRegistros.entrada1 = horaFormatada;
      showToast('Entrada 1 registrada!');
    } else if (!novosRegistros.saida1) {
      novosRegistros.saida1 = horaFormatada;
      showToast('Saída 1 registrada!');
    } else if (!novosRegistros.entrada2) {
      novosRegistros.entrada2 = horaFormatada;
      showToast('Entrada 2 registrada!');
    } else if (!novosRegistros.saida2) {
      novosRegistros.saida2 = horaFormatada;
      showToast('Saída 2 registrada!');
    } else {
      setIsSaving(false);
      return showToast('Todos os pontos de hoje já foram preenchidos.', 'error');
    }

    const pontoData = { 
      funcionarioId: colaborador.id, 
      data: hoje, 
      ...novosRegistros 
    };

    try {
      if (pontoHoje?.id) {
        await CloudService.updateRegistroPonto(pontoHoje.id, pontoData);
      } else {
        await CloudService.saveRegistroPonto(colaborador.userId, pontoData);
      }
      refreshData();
    } catch (e) {
      showToast('Erro ao gravar o ponto.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 text-center py-6">
      <Card className="border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/30 to-white">
        <h2 className="text-xl font-bold text-slate-800">Olá, {colaborador?.nome || 'Colaborador'}</h2>
        <p className="text-sm text-slate-500 mt-1">Registre seu horário de trabalho com segurança</p>
        
        <div className="my-8">
          <p className="text-5xl font-black font-mono text-indigo-700 tracking-wider">
            {horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-sm text-slate-400 mt-2 font-medium">
            {horaAtual.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <button 
          onClick={handleBaterPontoRapido}
          disabled={isSaving}
          className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all text-lg flex items-center justify-center space-x-2 disabled:opacity-70"
        >
          <Clock size={22} />
          <span>{isSaving ? 'Registrando...' : 'Bater Ponto Agora'}</span>
        </button>
      </Card>

      <Card>
        <h3 className="font-bold text-slate-700 text-left border-b pb-2 mb-4">Registros de Hoje</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-400 font-bold">Turno 1</p>
            <p className="text-md font-mono font-bold mt-1 text-slate-700">
              {pontoHoje?.entrada1 || '--:--'} → {pontoHoje?.saida1 || '--:--'}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-400 font-bold">Turno 2</p>
            <p className="text-md font-mono font-bold mt-1 text-slate-700">
              {pontoHoje?.entrada2 || '--:--'} → {pontoHoje?.saida2 || '--:--'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ==========================================
// MÓDULO: DASHBOARD (ADMIN)
// ==========================================
const Dashboard = () => {
  const { db } = useAppContext();
  const [mesAno, setMesAno] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const ativos = db.funcionarios.filter(f => f.status !== 'inativo').length;
  const pontosMesFiltrado = db.pontos.filter(p => p.data && p.data.substring(0, 7) === mesAno);

  let totalMinutosTrabalhados = 0; 
  let totalMinutosExtras50 = 0; 
  let totalMinutosExtras100 = 0;
  const diasMapa = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

  const pontosUnicos = {};
  pontosMesFiltrado.forEach(p => pontosUnicos[`${p.funcionarioId}-${p.data}`] = p);

  Object.values(pontosUnicos).forEach(p => {
    const jornada = db.jornadas.find(j => j.funcionarioId === p.funcionarioId);
    if (!jornada) return;

    const e1 = timeToMinutes(p.entrada1 || "00:00");
    const s1 = timeToMinutes(p.saida1 || "00:00");
    const e2 = timeToMinutes(p.entrada2 || "00:00");
    const s2 = timeToMinutes(p.saida2 || "00:00");

    let minsTrabalhados = 0;
    if (e1 > 0 && s1 > 0) minsTrabalhados += (s1 - e1);
    if (e2 > 0 && s2 > 0) minsTrabalhados += (s2 - e2);
    if (e1 > 0 && s2 > 0 && s1 === 0 && e2 === 0) minsTrabalhados = (s2 - e1);
    if (e1 > 0 && s1 > 0 && e2 === 0 && s2 === 0) minsTrabalhados = (s1 - e1);

    totalMinutosTrabalhados += minsTrabalhados;

    const dateObj = new Date(p.data.split('-').join('/'));
    const diaSemana = diasMapa[dateObj.getDay()];
    const configDia = jornada[diaSemana];

    let minsEsperados = 0;
    if (configDia && configDia.ativo) {
       minsEsperados = timeToMinutes(configDia.saida || "00:00") - timeToMinutes(configDia.entrada || "00:00") - timeToMinutes(configDia.intervalo || "00:00");
    }

    if (diaSemana === 'domingo' || !configDia?.ativo) {
      if (minsTrabalhados > 0) totalMinutosExtras100 += minsTrabalhados;
    } else if (minsTrabalhados > minsEsperados) {
      totalMinutosExtras50 += (minsTrabalhados - minsEsperados);
    }
  });

  const [anoStr, mesStr] = mesAno.split('-');
  const mesNome = new Date(anoStr, mesStr - 1, 1).toLocaleString('pt-BR', { month: 'long' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center border-b border-slate-200 pb-4">
        <div><h1 className="text-2xl font-bold text-slate-800">Dashboard</h1><p className="text-sm text-slate-500">Visão geral do sistema</p></div>
        <div className="flex items-center space-x-3 bg-white p-2 rounded-lg shadow-sm mt-4 md:mt-0 border border-slate-200">
           <label className="text-sm font-medium text-slate-600 pl-2">Competência:</label>
           <input type="month" value={mesAno} onChange={e => setMesAno(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-indigo-500" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="flex items-center space-x-4 border-l-4 border-l-indigo-500"><div className="p-3 bg-indigo-50 rounded-lg text-indigo-600"><Users size={24} /></div><div><p className="text-sm text-slate-500 font-medium">Ativos</p><p className="text-2xl font-bold text-slate-800">{ativos}</p></div></Card>
        <Card className="flex items-center space-x-4 border-l-4 border-l-emerald-500"><div className="p-3 bg-emerald-50 rounded-lg text-emerald-600"><Clock size={24} /></div><div><p className="text-sm text-slate-500 font-medium">Horas ({mesNome})</p><p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosTrabalhados)}</p></div></Card>
        <Card className="flex items-center space-x-4 border-l-4 border-l-amber-500"><div className="p-3 bg-amber-50 rounded-lg text-amber-600"><AlertCircle size={24} /></div><div><p className="text-sm text-slate-500 font-medium">Extras 50%</p><p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosExtras50)}</p></div></Card>
        <Card className="flex items-center space-x-4 border-l-4 border-l-red-500"><div className="p-3 bg-red-50 rounded-lg text-red-600"><AlertCircle size={24} /></div><div><p className="text-sm text-slate-500 font-medium">Extras 100%</p><p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosExtras100)}</p></div></Card>
      </div>
    </div>
  );
};

// ==========================================
// MÓDULO: LISTA DE FUNCIONÁRIOS
// ==========================================
const FuncionariosList = () => {
  const { db, refreshData, showToast, currentUser } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [currentFunc, setCurrentFunc] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = async (id) => {
    if (confirm('Tem certeza que deseja excluir?')) {
      await CloudService.deleteFuncionario(id);
      showToast('Excluído da nuvem');
      refreshData();
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (currentFunc.id) {
        await CloudService.updateFuncionario(currentFunc.id, currentFunc);
        showToast('Atualizado com sucesso');
      } else {
        await CloudService.saveFuncionario(currentUser.uid, currentFunc);
        showToast('Salvo com sucesso');
      }
      setIsEditing(false);
      refreshData();
    } catch (e) {
      showToast('Erro ao salvar', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">{currentFunc?.id ? 'Editar' : 'Novo'} Funcionário</h2>
          <Button variant="ghost" icon={ArrowLeftCircle} onClick={() => setIsEditing(false)}>Voltar</Button>
        </div>
        <Card>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome Completo" value={currentFunc?.nome || ''} onChange={e => setCurrentFunc({...currentFunc, nome: e.target.value})} required className="md:col-span-2" />
              <Input label="CPF" value={currentFunc?.cpf || ''} onChange={e => setCurrentFunc({...currentFunc, cpf: e.target.value})} required />
              <Input label="E-mail de Acesso (Login Colaborador)" type="email" value={currentFunc?.emailAcesso || ''} onChange={e => setCurrentFunc({...currentFunc, emailAcesso: e.target.value})} required />
              <Input label="Data de Admissão" type="date" value={currentFunc?.dataAdmissao || ''} onChange={e => setCurrentFunc({...currentFunc, dataAdmissao: e.target.value})} required />
              <Input label="Salário Base (R$)" type="number" value={currentFunc?.salario || ''} onChange={e => setCurrentFunc({...currentFunc, salario: e.target.value})} required />
            </div>
            <div className="pt-4 flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancelar</Button>
              <Button type="submit" icon={Cloud} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-slate-800">Funcionários</h1><Button icon={Plus} onClick={() => { setCurrentFunc({}); setIsEditing(true); }}>Novo</Button></div>
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 min-w-[600px]">
            <thead className="bg-slate-50 border-b"><tr><th className="px-6 py-4">Nome</th><th className="px-6 py-4">E-mail Acesso</th><th className="px-6 py-4">Salário</th><th className="px-6 py-4">Admissão</th><th className="px-6 py-4 text-right">Ações</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {db.funcionarios.map(f => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-800">{f.nome}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{f.emailAcesso || 'Não cadastrado'}</td>
                  <td className="px-6 py-4 font-mono text-green-700">{formatCurrency(f.salario)}</td>
                  <td className="px-6 py-4">{formatDate(f.dataAdmissao)}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setCurrentFunc(f); setIsEditing(true); }} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(f.id)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ==========================================
// MÓDULO: JORNADAS DE TRABALHO
// ==========================================
const JornadasTrabalho = () => {
  const { db, refreshData, showToast, currentUser } = useAppContext();
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const defaultDay = { ativo: true, entrada: '08:00', saida: '17:00', intervalo: '00:00' };
  const [jornada, setJornada] = useState({ segunda: { ...defaultDay }, terca: { ...defaultDay }, quarta: { ...defaultDay }, quinta: { ...defaultDay }, sexta: { ...defaultDay }, sabado: { ...defaultDay, ativo: false }, domingo: { ...defaultDay, ativo: false } });

  useEffect(() => {
    if (selectedFuncId) {
      const existing = db.jornadas.find(j => j.funcionarioId === selectedFuncId);
      if (existing) setJornada(existing);
      else setJornada({ segunda: { ...defaultDay }, terca: { ...defaultDay }, quarta: { ...defaultDay }, quinta: { ...defaultDay }, sexta: { ...defaultDay }, sabado: { ...defaultDay, ativo: false }, domingo: { ...defaultDay, ativo: false } });
    }
  }, [selectedFuncId, db.jornadas]);

  const handleSave = async () => {
    if (!selectedFuncId) return showToast('Selecione um funcionário', 'error');
    setIsSaving(true);
    try {
      await CloudService.saveJornada(currentUser.uid, selectedFuncId, jornada);
      showToast('Jornada salva');
      refreshData();
    } catch(e) {
      showToast('Erro ao salvar', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDayChange = (day, field, value) => setJornada(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  const diasSemana = [ { key: 'segunda', label: 'Segunda-feira' }, { key: 'terca', label: 'Terça-feira' }, { key: 'quarta', label: 'Quarta-feira' }, { key: 'quinta', label: 'Quinta-feira' }, { key: 'sexta', label: 'Sexta-feira' }, { key: 'sabado', label: 'Sábado' }, { key: 'domingo', label: 'Domingo' } ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-bold text-slate-800">Jornada de Trabalho</h1><Button icon={Cloud} onClick={handleSave} disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button></div>
      <Card>
        <div className="mb-6 max-w-md"><Select label="Selecione o Funcionário" value={selectedFuncId} onChange={(e) => setSelectedFuncId(e.target.value)} options={[{ label: '--- Selecione ---', value: '' }, ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))]} /></div>
        {selectedFuncId && (
          <div className="space-y-6">
            <div className="bg-indigo-50 p-4 rounded-lg flex space-x-8 border border-indigo-100">
              <div><p className="text-sm text-indigo-800 font-medium">Total Semanal</p><p className="text-2xl font-bold text-indigo-600">{calculateWeeklyHours(jornada).toFixed(1)}h</p></div>
              <div><p className="text-sm text-indigo-800 font-medium">Total Divisor Mensal</p><p className="text-2xl font-bold text-indigo-600">{calculateMonthlyHours(calculateWeeklyHours(jornada)).toFixed(1)}h</p></div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[500px]">
                <thead className="bg-slate-50 border-b"><tr><th className="px-4 py-3">Dia</th><th className="px-4 py-3 text-center">Trabalha?</th><th className="px-4 py-3">Entrada</th><th className="px-4 py-3">Saída</th><th className="px-4 py-3">Intervalo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {diasSemana.map(({key, label}) => (
                    <tr key={key} className={!jornada[key]?.ativo ? 'bg-slate-50 opacity-60' : ''}>
                      <td className="px-4 py-3 font-medium">{label}</td>
                      <td className="px-4 py-3 text-center"><input type="checkbox" checked={jornada[key]?.ativo || false} onChange={(e) => handleDayChange(key, 'ativo', e.target.checked)} className="w-4 h-4 cursor-pointer" /></td>
                      <td className="px-4 py-3"><input type="time" value={jornada[key]?.entrada || ''} disabled={!jornada[key]?.ativo} onChange={(e) => handleDayChange(key, 'entrada', e.target.value)} className="px-2 py-1 border rounded text-sm w-full" /></td>
                      <td className="px-4 py-3"><input type="time" value={jornada[key]?.saida || ''} disabled={!jornada[key]?.ativo} onChange={(e) => handleDayChange(key, 'saida', e.target.value)} className="px-2 py-1 border rounded text-sm w-full" /></td>
                      <td className="px-4 py-3"><input type="time" value={jornada[key]?.intervalo || '00:00'} disabled={!jornada[key]?.ativo} onChange={(e) => handleDayChange(key, 'intervalo', e.target.value)} className="px-2 py-1 border rounded text-sm w-full" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

// ==========================================
// MÓDULO: CONTROLE DE PONTO (ORDENAÇÃO POR DATA ATUALIZADA)
// ==========================================
const ControlePonto = () => {
  const { db, refreshData, showToast, currentUser } = useAppContext();
  const [date, setDate] = useState(getTodayLocal());
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [records, setRecords] = useState({ entrada1: '', saida1: '', entrada2: '', saida2: '', obs: '' });

  const setTimeNow = (field) => {
    const now = new Date();
    setRecords(prev => ({ ...prev, [field]: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` }));
  };

  const handleSavePonto = async () => {
    if (!selectedFuncId || !date) return showToast('Preencha funcionário e data', 'error');
    setIsSaving(true);
    try {
      const pontoData = { funcionarioId: selectedFuncId, data: date, ...records };
      if (editingId) await CloudService.updateRegistroPonto(editingId, pontoData);
      else await CloudService.saveRegistroPonto(currentUser.uid, pontoData);
      showToast('Ponto salvo!');
      refreshData();
      setEditingId(null);
      setRecords({ entrada1: '', saida1: '', entrada2: '', saida2: '', obs: '' });
    } catch(e) { showToast('Erro', 'error'); } 
    finally { setIsSaving(false); }
  };

  const handleEdit = (ponto) => {
    setEditingId(ponto.id); setSelectedFuncId(ponto.funcionarioId); setDate(ponto.data);
    setRecords({ entrada1: ponto.entrada1||'', saida1: ponto.saida1||'', entrada2: ponto.entrada2||'', saida2: ponto.saida2||'', obs: ponto.obs||'' });
  };

  const handleDelete = async (id) => {
    if (confirm('Excluir este registro?')) {
      await CloudService.deleteRegistroPonto(id);
      showToast('Excluído'); refreshData();
    }
  };

  // ATUALIZAÇÃO DA ORDENAÇÃO: Alinha do mais recente (maior data) para o mais antigo (menor data)
  const pontosOrdenados = [...db.pontos].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Lançamento de Ponto (Manual)</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 space-y-5 bg-slate-50 border-2">
          <div className="flex justify-between items-center border-b pb-3"><h3 className="font-bold text-lg">{editingId ? 'Editar Registro' : 'Lançar Ponto'}</h3></div>
          <Select label="Funcionário" value={selectedFuncId} onChange={(e) => setSelectedFuncId(e.target.value)} options={[{ label: 'Selecione...', value: '' }, ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))]} />
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between items-center"><label className="text-sm font-medium">Data</label><button type="button" onClick={() => setDate(getTodayLocal())} className="text-[11px] text-indigo-600 font-bold bg-indigo-50 px-2 rounded">Hoje</button></div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-3 border border-slate-300 rounded-lg text-lg text-center" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {['entrada1', 'saida1', 'entrada2', 'saida2'].map((field, idx) => (
              <div key={field} className="flex flex-col space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-500">{['Entrada 1', 'Saída 1', 'Entrada 2', 'Saída 2'][idx]}</label>
                  <button type="button" onClick={() => setTimeNow(field)} className="text-[10px] text-indigo-600 font-bold px-1.5 bg-indigo-50 rounded">Agora</button>
                </div>
                <input type="time" value={records[field]} onChange={e => setRecords({...records, [field]: e.target.value})} className="w-full px-2 py-2 border rounded-lg text-center font-mono" />
              </div>
            ))}
          </div>
          <Button className="w-full justify-center py-3 text-lg" icon={Cloud} onClick={handleSavePonto} disabled={isSaving}>{isSaving ? 'Enviando...' : 'Salvar'}</Button>
        </Card>
        <Card className="lg:col-span-2 p-0 overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-white"><h3 className="font-semibold">Últimos Registros do Sistema</h3></div>
          <div className="flex-1 overflow-x-auto p-0 bg-white">
             <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-50 border-b"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Funcionário</th><th className="px-4 py-3 text-center">Início</th><th className="px-4 py-3 text-center">Fim</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pontosOrdenados.slice(0, 15).map((p, i) => (
                      <tr key={p.id || i} className="hover:bg-slate-50">
                        <td className="px-4 py-3">{formatDate(p.data)}</td>
                        <td className="px-4 py-3 font-medium">{db.funcionarios.find(f => f.id === p.funcionarioId)?.nome || 'Desconhecido'}</td>
                        <td className="px-4 py-3 text-center font-mono bg-emerald-50/50">{p.entrada1 || '-'}</td>
                        <td className="px-4 py-3 text-center font-mono bg-orange-50/50">{p.saida2 || p.saida1 || '-'}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ==========================================
// MÓDULO: FOLHA DE PAGAMENTO (DINÂMICO)
// ==========================================
const FolhaPagamento = () => {
  const { db, showToast, isAdmin } = useAppContext();
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [calculoRealizado, setCalculoRealizado] = useState(null);

  useEffect(() => {
    const hoje = new Date();
    let anoAtual = hoje.getFullYear(); let mesAtual = hoje.getMonth() + 1;
    let mesAnterior = mesAtual === 1 ? 12 : mesAtual - 1;
    let anoAnterior = mesAtual === 1 ? anoAtual - 1 : anoAtual;
    setDataInicio(`${anoAnterior}-${String(mesAnterior).padStart(2, '0')}-26`);
    setDataFim(`${anoAtual}-${String(mesAtual).padStart(2, '0')}-25`);
  }, []);

  const processarFolha = () => {
    const idParaProcessar = isAdmin ? selectedFuncId : db.funcionarios[0]?.id;

    if (!idParaProcessar || !dataInicio || !dataFim) return showToast('Preencha os campos', 'error');

    const funcionario = db.funcionarios.find(f => f.id === idParaProcessar);
    const jornada = db.jornadas.find(j => j.funcionarioId === idParaProcessar);
    
    if (!funcionario || !jornada) return showToast('Dados insuficientes configurados para gerar o recibo', 'error');

    const pontosFiltrados = db.pontos.filter(p => 
      p.funcionarioId === idParaProcessar && p.data >= dataInicio && p.data <= dataFim
    );

    let totais = { he50: 0, he100: 0, falta: 0 };
    const pontosUnicos = {};
    pontosFiltrados.forEach(p => pontosUnicos[p.data] = p); 

    Object.values(pontosUnicos).forEach(p => {
      const e1 = timeToMinutes(p.entrada1 || "00:00");
      const s1 = timeToMinutes(p.saida1 || "00:00");
      const e2 = timeToMinutes(p.entrada2 || "00:00");
      const s2 = timeToMinutes(p.saida2 || "00:00");
      
      let trabalhado = 0;
      if (e1 > 0 && s1 > 0) trabalhado += (s1 - e1);
      if (e2 > 0 && s2 > 0) trabalhado += (s2 - e2);
      if (e1 > 0 && s2 > 0 && s1 === 0 && e2 === 0) trabalhado = (s2 - e1);
      if (e1 > 0 && s1 > 0 && e2 === 0 && s2 === 0) trabalhado = (s1 - e1);

      const diaSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][new Date(p.data.split('-').join('/')).getDay()];
      const conf = jornada[diaSemana];
      
      const esperado = (conf?.ativo) ? (timeToMinutes(conf.saida || "00:00") - timeToMinutes(conf.entrada || "00:00") - timeToMinutes(conf.intervalo || "00:00")) : 0;

      if (!conf?.ativo || diaSemana === 'domingo') {
          if (trabalhado > 0) totais.he100 += trabalhado;
      } else {
          if (trabalhado > esperado) {
              totais.he50 += (trabalhado - esperado);
          } else if (trabalhado < esperado && trabalhado > 0) {
              totais.falta += (esperado - trabalhado);
          }
      }
    });

    const salarioBase = Number(funcionario.salario) || 0;
    
    const horasSemanaisReal = calculateWeeklyHours(jornada);
    const divisorMensalDinamico = calculateMonthlyHours(horasSemanaisReal);
    const valorHora = salarioBase / divisorMensalDinamico; 
    
    const vHE50 = (totais.he50 / 60) * valorHora * 1.5;
    const vHE100 = (totais.he100 / 60) * valorHora * 2.0;
    
    const vFalta = (totais.falta / 60) * valorHora;
    const inss = salarioBase * 0.075;
    
    setCalculoRealizado({
      funcionario, dataInicio, dataFim, base: salarioBase,
      vHE50: vHE50, 
      vHE100: vHE100,
      vFalta: vFalta, inss: inss,
      liquido: salarioBase + vHE50 + vHE100 - vFalta - inss,
      totais: { he: (totais.he50 + totais.he100), falta: totais.falta }
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">{isAdmin ? 'Folha de Pagamento' : 'Meu Holerite'}</h1>
      <Card className="bg-slate-50 border-dashed border-2 p-6">
        <div className={`grid ${isAdmin ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'} gap-4 items-end`}>
          {isAdmin && (
            <Select label="Funcionário" value={selectedFuncId} onChange={e => setSelectedFuncId(e.target.value)} options={[{ label: '...', value: '' }, ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))]} />
          )}
          <Input label="De" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          <Input label="Até" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          <Button icon={FileText} onClick={processarFolha}>{isAdmin ? 'Gerar Holerite' : 'Visualizar Recibo'}</Button>
        </div>
      </Card>
      
      {calculoRealizado && (
        <Card className="max-w-3xl mx-auto p-0 overflow-hidden shadow-md border border-slate-200">
          <div className="bg-slate-800 text-white p-6 flex justify-between items-center">
            <div>
               <h2 className="text-xl font-bold">Recibo de Pagamento</h2>
               <p className="text-slate-300 text-sm">Ref: {formatDate(calculoRealizado.dataInicio)} a {formatDate(calculoRealizado.dataFim)}</p>
            </div>
            {isAdmin && <Button variant="secondary" icon={FileText} onClick={() => window.print()} className="hidden md:flex">Imprimir</Button>}
          </div>
          <table className="w-full text-sm">
             <tbody className="divide-y divide-slate-100">
               <tr>
                 <td className="px-6 py-4 font-medium">Salário Base</td>
                 <td className="px-6 py-4 text-right text-green-600 font-mono">{formatCurrency(calculoRealizado.base)}</td>
               </tr>
               <tr>
                 <td className="px-6 py-4 font-medium">Horas Extras ({Math.floor(calculoRealizado.totais.he / 60)}h {calculoRealizado.totais.he % 60}m)</td>
                 <td className="px-6 py-4 text-right text-green-600 font-mono">{formatCurrency(calculoRealizado.vHE50 + calculoRealizado.vHE100)}</td>
               </tr>
               <tr>
                 <td className="px-6 py-4 font-medium">Faltas e Atrasos ({Math.floor(calculoRealizado.totais.falta / 60)}h {calculoRealizado.totais.falta % 60}m)</td>
                 <td className="px-6 py-4 text-right text-red-600 font-mono">- {formatCurrency(calculoRealizado.vFalta)}</td>
               </tr>
               <tr>
                 <td className="px-6 py-4 font-medium">INSS (7.5%)</td>
                 <td className="px-6 py-4 text-right text-red-600 font-mono">- {formatCurrency(calculoRealizado.inss)}</td>
               </tr>
             </tbody>
             <tfoot className="bg-slate-50 border-t-2 border-slate-200">
               <tr>
                 <td className="px-6 py-4 font-bold text-right">Líquido a Receber:</td>
                 <td className="px-6 py-4 text-right text-2xl font-bold text-indigo-700 font-mono">{formatCurrency(calculoRealizado.liquido)}</td>
               </tr>
             </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
};

// ==========================================
// MÓDULO: SEGURANÇA / BACKUP
// ==========================================
const Backup = () => {
  const { db } = useAppContext();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Segurança de Dados</h1>
      <Card className="text-center p-10 space-y-4 max-w-lg mx-auto">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"><Cloud size={32} /></div>
        <h3 className="text-lg font-bold text-slate-800">Sincronização Ativa</h3>
        <p className="text-sm text-slate-500">Seus dados agora são salvos automaticamente no Google Cloud Firestore.</p>
        <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-400 font-mono text-left overflow-hidden">
          Registros na nuvem activos:<br/>
          - {db.funcionarios.length} Funcionários<br/>
          - {db.pontos.length} Pontos Batidos
        </div>
      </Card>
    </div>
  );
};

// ==========================================
// MÓDULO: LOGIN SCREEN
// ==========================================
const LoginScreen = () => {
  const { login, showToast } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      showToast('Bem-vindo!');
    } catch (error) {
      showToast('E-mail ou senha incorretos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="bg-indigo-600 p-8 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            <Coffee size={32} className="text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-white">BabáManager</h2>
          <p className="text-indigo-200 text-sm mt-1">Acesso ao Sistema</p>
        </div>
        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70">
              {loading ? 'Autenticando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// LAYOUT PRINCIPAL & NAVEGAÇÃO
// ==========================================
const AppLayout = () => {
  const { currentRoute, setCurrentRoute, logout, dataSyncing, isAdmin } = useAppContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = isAdmin ? [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'funcionarios', label: 'Funcionários', icon: Users },
    { id: 'jornadas', label: 'Jornadas', icon: Calendar },
    { id: 'ponto', label: 'Lançar Ponto', icon: Clock },
    { id: 'folha', label: 'Folha Pagamento', icon: DollarSign },
    { id: 'backup', label: 'Segurança', icon: Settings },
  ] : [
    { id: 'ponto_colaborador', label: 'Bater Ponto', icon: Clock },
    { id: 'folha', label: 'Meu Holerite', icon: DollarSign },
  ];

  useEffect(() => {
    if (!isAdmin && currentRoute === 'dashboard') {
      setCurrentRoute('ponto_colaborador');
    }
  }, [isAdmin, currentRoute, setCurrentRoute]);

  const renderContent = () => {
    switch (currentRoute) {
      case 'funcionarios': return isAdmin ? <FuncionariosList /> : null;
      case 'jornadas': return isAdmin ? <JornadasTrabalho /> : null;
      case 'ponto': return isAdmin ? <ControlePonto /> : null;
      case 'ponto_colaborador': return <PontoColaborador />;
      case 'folha': return <FolhaPagamento />;
      case 'backup': return isAdmin ? <Backup /> : null;
      default: return isAdmin ? <Dashboard /> : <PontoColaborador />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}
      <aside className={`fixed inset-y-0 left-0 bg-white w-64 border-r flex flex-col z-50 transform transition-transform lg:translate-x-0 lg:static lg:block ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b"><Coffee size={28} className="text-indigo-600 mr-2" /><span className="text-xl font-black text-indigo-600">BabáManager</span></div>
        <div className="flex-1 py-6 px-3 space-y-1">
          {menuItems.map(item => (
            <button key={item.id} onClick={() => { setCurrentRoute(item.id); setIsMobileMenuOpen(false); }} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium ${currentRoute === item.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <item.icon size={20} className={currentRoute === item.id ? 'text-indigo-200' : 'text-slate-400'} /><span>{item.label}</span>
            </button>
          ))}
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-6">
          <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden"><Menu size={24} /></button>
          <div className="hidden lg:flex font-medium text-slate-500 items-center">
            {dataSyncing && <><Cloud size={16} className="mr-2 animate-pulse text-indigo-500" /> <span className="text-sm text-indigo-500">Sincronizando Nuvem...</span></>}
          </div>
          <div className="flex items-center space-x-4">
             <span className={`text-xs px-2 py-1 rounded-full ${isAdmin ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}`}>
               {isAdmin ? 'Acesso Administrativo' : 'Perfil Colaborador'}
             </span>
             <button onClick={logout} className="flex items-center text-sm font-medium text-slate-500 hover:text-red-600"><LogOut size={18} className="mr-1"/> Sair</button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-8"><div className="max-w-6xl mx-auto">{renderContent()}</div></div>
      </main>
    </div>
  );
};

const AuthWrapper = () => {
  const { currentUser, authLoading } = useAppContext();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><div className="animate-spin h-12 w-12 border-b-2 border-indigo-600 rounded-full"></div></div>;
  if (!currentUser) return <LoginScreen />;
  return <AppLayout />;
};

export default function App() {
  return <AppProvider><AuthWrapper /></AppProvider>;
}