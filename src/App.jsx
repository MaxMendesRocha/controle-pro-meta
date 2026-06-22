import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { 
  Home, Users, Calendar, Clock, DollarSign, FileText, 
  Settings, Download, Upload, Plus, Edit2, Trash2, 
  Menu, X, AlertCircle, CheckCircle, ChevronRight,
  Briefcase, Coffee, ArrowRightCircle, ArrowLeftCircle
} from 'lucide-react';

// ==========================================
// 1. UTILS & HELPER FUNCTIONS
// ==========================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatDate = (dateString) => {
  if (!dateString) return '';
  // Separamos a string manualmente para ignorar qualquer conversão de fuso horário
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

// Aproveite e adicione também esta função logo abaixo, ela vai ajudar no próximo passo:
const getTodayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

// Time calculations (HH:MM to minutes and back)
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
};

const minutesToTime = (mins) => {
  if (isNaN(mins) || mins < 0) return '00:00';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const calcHoursDecimal = (mins) => (mins / 60).toFixed(2);

// ==========================================
// 2. STORAGE SERVICE (Data Abstraction Layer)
// ==========================================
const DB_KEY = '@BabaManager:DB_v1';

const initialDBState = {
  funcionarios: [],
  salarios: [],
  jornadas: [],
  registrosPonto: [],
  feriados: [],
  folhasPagamento: [],
  configuracoes: {
    nomeFamilia: 'Marcello Mendes',
    moeda: 'BRL',
    regras: { intervaloMinimo: 60, horasParaIntervalo: 360 }
  }
};

const StorageService = {
  init: () => {
    if (!localStorage.getItem(DB_KEY)) {
      localStorage.setItem(DB_KEY, JSON.stringify(initialDBState));
    }
  },
  _getDB: () => JSON.parse(localStorage.getItem(DB_KEY)) || initialDBState,
  _saveDB: (data) => localStorage.setItem(DB_KEY, JSON.stringify(data)),

  // Funcionários
  getFuncionarios: () => StorageService._getDB().funcionarios,
  saveFuncionario: (func) => {
    const db = StorageService._getDB();
    const newFunc = { ...func, id: func.id || generateId(), createdAt: new Date().toISOString() };
    db.funcionarios.push(newFunc);
    StorageService._saveDB(db);
    return newFunc;
  },
  updateFuncionario: (id, data) => {
    const db = StorageService._getDB();
    db.funcionarios = db.funcionarios.map(f => f.id === id ? { ...f, ...data, updatedAt: new Date().toISOString() } : f);
    StorageService._saveDB(db);
  },
  deleteFuncionario: (id) => {
    const db = StorageService._getDB();
    db.funcionarios = db.funcionarios.filter(f => f.id !== id);
    StorageService._saveDB(db);
  },

  // Jornadas
  getJornadas: () => StorageService._getDB().jornadas,
  saveJornada: (jornada) => {
    const db = StorageService._getDB();
    const existingIndex = db.jornadas.findIndex(j => j.funcionarioId === jornada.funcionarioId);
    if (existingIndex >= 0) {
      db.jornadas[existingIndex] = { ...jornada, updatedAt: new Date().toISOString() };
    } else {
      db.jornadas.push({ ...jornada, id: generateId() });
    }
    StorageService._saveDB(db);
  },

// Registros de Ponto
  getRegistrosPonto: () => StorageService._getDB().registrosPonto,
  saveRegistroPonto: (registro) => {
    const db = StorageService._getDB();
    db.registrosPonto.push({ ...registro, id: generateId() });
    StorageService._saveDB(db);
  },
  // ADICIONE ESTAS DUAS FUNÇÕES ABAIXO:
  updateRegistroPonto: (id, data) => {
    const db = StorageService._getDB();
    db.registrosPonto = db.registrosPonto.map(p => p.id === id ? { ...p, ...data } : p);
    StorageService._saveDB(db);
  },
  deleteRegistroPonto: (id) => {
    const db = StorageService._getDB();
    db.registrosPonto = db.registrosPonto.filter(p => p.id !== id);
    StorageService._saveDB(db);
  },

  // Feriados
  getFeriados: () => StorageService._getDB().feriados,
  saveFeriado: (feriado) => {
    const db = StorageService._getDB();
    db.feriados.push({ ...feriado, id: generateId() });
    StorageService._saveDB(db);
  },

  // Configs & Backup
  getConfiguracoes: () => StorageService._getDB().configuracoes,
  exportData: () => JSON.stringify(StorageService._getDB(), null, 2),
  importData: (jsonData) => {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed.funcionarios) {
        StorageService._saveDB(parsed);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
};

// Initialize DB on script load
StorageService.init();

// ==========================================
// 3. CONTEXT & STATE MANAGEMENT
// ==========================================
const AppContext = createContext();

const AppProvider = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState(null);

  const refreshData = () => setRefreshTrigger(prev => prev + 1);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const db = useMemo(() => ({
    funcionarios: StorageService.getFuncionarios(),
    jornadas: StorageService.getJornadas(),
    pontos: StorageService.getRegistrosPonto(),
    feriados: StorageService.getFeriados()
  }), [refreshTrigger]);

  return (
    <AppContext.Provider value={{ currentRoute, setCurrentRoute, db, refreshData, showToast }}>
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
// 4. UI COMPONENTS (Atoms/Molecules)
// ==========================================
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${className}`}>
    {children}
  </div>
);

const Button = ({ children, variant = 'primary', icon: Icon, onClick, type = 'button', className = '' }) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-transparent',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent'
  };
  
  return (
    <button 
      type={type} 
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 text-sm ${variants[variant]} ${className}`}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
};

const Input = ({ label, type = 'text', value, onChange, required, className = '', step }) => (
  <div className={`flex flex-col space-y-1 ${className}`}>
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      required={required}
      step={step}
      className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-800"
    />
  </div>
);

const Select = ({ label, value, onChange, options, className = '' }) => (
  <div className={`flex flex-col space-y-1 ${className}`}>
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-800"
    >
      {options.map((opt, i) => (
        <option key={i} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

// ==========================================
// 5. DOMAIN LOGIC & CALCULATIONS
// ==========================================
const calculateWeeklyHours = (jornada) => {
  if (!jornada) return 0;
  let totalMins = 0;
  const days = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  
  days.forEach(day => {
    const config = jornada[day];
    if (config && config.ativo) {
      const start = timeToMinutes(config.entrada);
      const end = timeToMinutes(config.saida);
      const interval = timeToMinutes(config.intervalo);
      if (end > start) {
        totalMins += (end - start - interval);
      }
    }
  });
  return totalMins / 60;
};

const calculateMonthlyHours = (weeklyHours) => {
  return (weeklyHours * 30) / 7;
};

// Calculate general dashboard statistics based on actual points vs expected schedule
const calculateDashboardStats = (db) => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let workedMins = 0;
  let he50Mins = 0;
  let he100Mins = 0;

  db.pontos.forEach(p => {
    // Treat dates to avoid timezone shifts
    const [year, month, day] = p.data.split('-').map(Number);
    const pointDate = new Date(year, month - 1, day);

    if (pointDate.getMonth() === currentMonth && pointDate.getFullYear() === currentYear) {
       const e1 = timeToMinutes(p.entrada1);
       const s1 = timeToMinutes(p.saida1);
       const e2 = timeToMinutes(p.entrada2);
       const s2 = timeToMinutes(p.saida2);
       
       let dailyMins = 0;
       if (s1 > e1) dailyMins += (s1 - e1);
       if (s2 > e2) dailyMins += (s2 - e2);

       workedMins += dailyMins;

       const dayOfWeek = pointDate.getDay(); // 0 is Sunday
       const isHoliday = db.feriados.some(f => f.data === p.data);

       if (dayOfWeek === 0 || isHoliday) {
         // Sundays and Holidays are 100%
         he100Mins += dailyMins;
       } else {
         const jornada = db.jornadas.find(j => j.funcionarioId === p.funcionarioId);
         if (jornada) {
           const daysMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
           const dayConfig = jornada[daysMap[dayOfWeek]];
           
           if (dayConfig && dayConfig.ativo) {
             const expectedMins = timeToMinutes(dayConfig.saida) - timeToMinutes(dayConfig.entrada) - timeToMinutes(dayConfig.intervalo);
             if (dailyMins > expectedMins) {
               he50Mins += (dailyMins - expectedMins);
             }
           } else {
             // Worked on a non-working regular day (e.g., Saturday off) -> Usually 50%
             he50Mins += dailyMins;
           }
         }
       }
    }
  });

  return {
    trabalhadas: minutesToTime(workedMins),
    he50: minutesToTime(he50Mins),
    he100: minutesToTime(he100Mins)
  };
};

// ==========================================
// 6. PAGE COMPONENTS
// ==========================================
const Dashboard = () => {
  const { db } = useAppContext();
  
  // Estado para o filtro de mês (inicia no mês atual local)
  const [mesAno, setMesAno] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const ativos = db.funcionarios.filter(f => f.status !== 'inativo').length;

  // Filtra os pontos de acordo com o mês/ano selecionado
  const pontosMesFiltrado = db.pontos.filter(p => {
    if (!p.data) return false;
    const [year, month] = p.data.split('-');
    return `${year}-${month}` === mesAno;
  });

  let totalMinutosTrabalhados = 0;
  let totalMinutosExtras50 = 0;
  let totalMinutosExtras100 = 0;

  const diasMapa = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

  pontosMesFiltrado.forEach(p => {
    const jornada = db.jornadas.find(j => j.funcionarioId === p.funcionarioId);
    if (!jornada) return;

    const e1 = p.entrada1 ? timeToMinutes(p.entrada1) : null;
    const s1 = p.saida1 ? timeToMinutes(p.saida1) : null;
    const e2 = p.entrada2 ? timeToMinutes(p.entrada2) : null;
    const s2 = p.saida2 ? timeToMinutes(p.saida2) : null;

    let minsTrabalhados = 0;
    if (e1 !== null && s1 !== null && e2 !== null && s2 !== null) {
       minsTrabalhados = (s1 - e1) + (s2 - e2);
    } else if (e1 !== null && s1 !== null && e2 === null && s2 === null) {
       minsTrabalhados = s1 - e1;
    } else if (e1 !== null && s1 === null && e2 === null && s2 !== null) {
       minsTrabalhados = s2 - e1;
    } else {
       const turno1 = (s1 !== null && e1 !== null && s1 > e1) ? (s1 - e1) : 0;
       const turno2 = (s2 !== null && e2 !== null && s2 > e2) ? (s2 - e2) : 0;
       minsTrabalhados = turno1 + turno2;
    }

    if (minsTrabalhados < 0) minsTrabalhados = 0;
    totalMinutosTrabalhados += minsTrabalhados;

    const [pAno, pMes, pDia] = p.data.split('-');
    const dateObj = new Date(pAno, pMes - 1, pDia);
    const diaSemana = diasMapa[dateObj.getDay()];

    const configDia = jornada[diaSemana];
    let minsEsperados = 0;

    if (configDia && configDia.ativo) {
       const expE = timeToMinutes(configDia.entrada);
       const expS = timeToMinutes(configDia.saida);
       const expI = timeToMinutes(configDia.intervalo);
       if (expS > expE) {
          minsEsperados = (expS - expE) - expI;
       }
    }

    // NOVA REGRA: É domingo OU é um dia de folga (desativado na jornada)?
    const isFolga = !configDia || !configDia.ativo;

    if (diaSemana === 'domingo' || isFolga) {
       totalMinutosExtras100 += minsTrabalhados;
    } else {
       if (minsTrabalhados > minsEsperados) {
          totalMinutosExtras50 += (minsTrabalhados - minsEsperados);
       }
    }
  });

  const formatarTempo = (minutos) => {
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    if (h === 0 && m === 0) return '00h 00m';
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  const [anoStr, mesStr] = mesAno.split('-');
  const dataFiltro = new Date(anoStr, mesStr - 1, 1);
  const mesNome = dataFiltro.toLocaleString('pt-BR', { month: 'long' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center space-y-4 md:space-y-0 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Visão geral do período selecionado</p>
        </div>
        <div className="flex items-center space-x-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
           <label className="text-sm font-medium text-slate-600 pl-2">Competência:</label>
           <input 
             type="month" 
             value={mesAno} 
             onChange={e => setMesAno(e.target.value)} 
             className="px-3 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 focus:ring-indigo-500 focus:border-indigo-500"
           />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="flex items-center space-x-4 border-l-4 border-l-indigo-500">
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600"><Users size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Funcionários Ativos</p>
            <p className="text-2xl font-bold text-slate-800">{ativos}</p>
          </div>
        </Card>
        
        <Card className="flex items-center space-x-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-50 rounded-lg text-emerald-600"><Clock size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Horas Trab. ({mesNome})</p>
            <p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosTrabalhados)}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 border-l-4 border-l-amber-500">
          <div className="p-3 bg-amber-50 rounded-lg text-amber-600"><AlertCircle size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Horas Extras 50%</p>
            <p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosExtras50)}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 border-l-4 border-l-red-500">
          <div className="p-3 bg-red-50 rounded-lg text-red-600"><AlertCircle size={24} /></div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Horas Extras 100%</p>
            <p className="text-xl font-bold text-slate-800">{formatarTempo(totalMinutosExtras100)}</p>
          </div>
        </Card>
      </div>
    </div>
  );
};

const FuncionariosList = () => {
  const { db, refreshData, showToast } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [currentFunc, setCurrentFunc] = useState(null);

  const handleDelete = (id) => {
    if (confirm('Tem certeza que deseja excluir este funcionário?')) {
      StorageService.deleteFuncionario(id);
      showToast('Funcionário excluído com sucesso');
      refreshData();
    }
  };

  const handleEdit = (func) => {
    setCurrentFunc(func);
    setIsEditing(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (currentFunc.id) {
      StorageService.updateFuncionario(currentFunc.id, currentFunc);
      showToast('Funcionário atualizado');
    } else {
      StorageService.saveFuncionario(currentFunc);
      showToast('Funcionário cadastrado');
    }
    setIsEditing(false);
    refreshData();
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
              <Input label="RG" value={currentFunc?.rg || ''} onChange={e => setCurrentFunc({...currentFunc, rg: e.target.value})} />
              <Input label="Data de Nascimento" type="date" value={currentFunc?.dataNascimento || ''} onChange={e => setCurrentFunc({...currentFunc, dataNascimento: e.target.value})} />
              <Input label="Data de Admissão" type="date" value={currentFunc?.dataAdmissao || ''} onChange={e => setCurrentFunc({...currentFunc, dataAdmissao: e.target.value})} required />
              <Input label="Telefone" value={currentFunc?.telefone || ''} onChange={e => setCurrentFunc({...currentFunc, telefone: e.target.value})} />
              <Input label="Cargo" value={currentFunc?.cargo || 'Babá'} onChange={e => setCurrentFunc({...currentFunc, cargo: e.target.value})} />
              <Input label="Salário Base (R$)" type="number" value={currentFunc?.salario || ''} onChange={e => setCurrentFunc({...currentFunc, salario: e.target.value})} required />
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex justify-end space-x-2">
              <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancelar</Button>
              <Button type="submit" icon={CheckCircle}>Salvar Registro</Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Funcionários</h1>
        <Button icon={Plus} onClick={() => { setCurrentFunc({}); setIsEditing(true); }}>Novo</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 min-w-[600px]">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 whitespace-nowrap">Nome</th>
                <th className="px-6 py-4 whitespace-nowrap">Cargo</th>
                <th className="px-6 py-4 whitespace-nowrap">Salário</th>
                <th className="px-6 py-4 whitespace-nowrap">Admissão</th>
                <th className="px-6 py-4 whitespace-nowrap text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.funcionarios.length === 0 && (
                <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400">Nenhum funcionário cadastrado.</td></tr>
              )}
              {db.funcionarios.map(f => (
                <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">{f.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{f.cargo || 'Babá'}</td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-green-700">{formatCurrency(f.salario)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{formatDate(f.dataAdmissao)}</td>
                  <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => handleEdit(f)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(f.id)} className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
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

const JornadasTrabalho = () => {
  const { db, refreshData, showToast } = useAppContext();
  const [selectedFuncId, setSelectedFuncId] = useState('');
  
  const defaultDay = { ativo: true, entrada: '08:00', saida: '17:00', intervalo: '01:00' };
  const [jornada, setJornada] = useState({
    segunda: { ...defaultDay }, terca: { ...defaultDay }, quarta: { ...defaultDay },
    quinta: { ...defaultDay }, sexta: { ...defaultDay }, sabado: { ...defaultDay, ativo: false }, domingo: { ...defaultDay, ativo: false }
  });

  useEffect(() => {
    if (selectedFuncId) {
      const existing = db.jornadas.find(j => j.funcionarioId === selectedFuncId);
      if (existing) {
        setJornada(existing);
      } else {
        setJornada({
          segunda: { ...defaultDay }, terca: { ...defaultDay }, quarta: { ...defaultDay },
          quinta: { ...defaultDay }, sexta: { ...defaultDay }, sabado: { ...defaultDay, ativo: false }, domingo: { ...defaultDay, ativo: false }
        });
      }
    }
  }, [selectedFuncId, db.jornadas]);

  const handleSave = () => {
    if (!selectedFuncId) return showToast('Selecione um funcionário', 'error');
    StorageService.saveJornada({ funcionarioId: selectedFuncId, ...jornada });
    showToast('Jornada salva com sucesso');
    refreshData();
  };

  const handleDayChange = (day, field, value) => {
    setJornada(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  const diasSemana = [
    { key: 'segunda', label: 'Segunda-feira' }, { key: 'terca', label: 'Terça-feira' },
    { key: 'quarta', label: 'Quarta-feira' }, { key: 'quinta', label: 'Quinta-feira' },
    { key: 'sexta', label: 'Sexta-feira' }, { key: 'sabado', label: 'Sábado' }, { key: 'domingo', label: 'Domingo' }
  ];

  const weeklyHours = calculateWeeklyHours(jornada);
  const monthlyHours = calculateMonthlyHours(weeklyHours);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Jornada de Trabalho</h1>
        <Button icon={CheckCircle} onClick={handleSave}>Salvar Jornada</Button>
      </div>

      <Card>
        <div className="mb-6 max-w-md">
          <Select 
            label="Selecione o Funcionário" 
            value={selectedFuncId} 
            onChange={(e) => setSelectedFuncId(e.target.value)}
            options={[
              { label: '--- Selecione ---', value: '' },
              ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))
            ]}
          />
        </div>

        {selectedFuncId && (
          <div className="space-y-6">
            <div className="bg-indigo-50 p-4 rounded-lg flex space-x-8">
              <div>
                <p className="text-sm text-indigo-800 font-medium">Total Semanal</p>
                <p className="text-2xl font-bold text-indigo-600">{weeklyHours.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-sm text-indigo-800 font-medium">Total Mensal (Base)</p>
                <p className="text-2xl font-bold text-indigo-600">{monthlyHours.toFixed(2)}h</p>
              </div>
              <div className="pt-1">
                 <p className="text-xs text-indigo-600 max-w-xs">Base de cálculo mensal = (Horas Semanais × 30) ÷ 7. O valor da hora será calculado automaticamente na folha.</p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 whitespace-nowrap">Dia</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Trabalha?</th>
                      <th className="px-4 py-3 whitespace-nowrap">Entrada</th>
                      <th className="px-4 py-3 whitespace-nowrap">Saída</th>
                      <th className="px-4 py-3 whitespace-nowrap">Intervalo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diasSemana.map(({key, label}) => (
                      <tr key={key} className={!jornada[key]?.ativo ? 'bg-slate-50 opacity-60' : ''}>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{label}</td>
                        <td className="px-4 py-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={jornada[key]?.ativo || false}
                            onChange={(e) => handleDayChange(key, 'ativo', e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <input type="time" value={jornada[key]?.entrada || ''} disabled={!jornada[key]?.ativo}
                            onChange={(e) => handleDayChange(key, 'entrada', e.target.value)}
                            className="px-2 py-1 border rounded text-sm w-full disabled:bg-slate-100" />
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <input type="time" value={jornada[key]?.saida || ''} disabled={!jornada[key]?.ativo}
                            onChange={(e) => handleDayChange(key, 'saida', e.target.value)}
                            className="px-2 py-1 border rounded text-sm w-full disabled:bg-slate-100" />
                        </td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <input type="time" value={jornada[key]?.intervalo || ''} disabled={!jornada[key]?.ativo}
                            onChange={(e) => handleDayChange(key, 'intervalo', e.target.value)}
                            className="px-2 py-1 border rounded text-sm w-full disabled:bg-slate-100" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

const ControlePonto = () => {
  const { db, refreshData, showToast } = useAppContext();
  
  // Função auxiliar para pegar a data de hoje no fuso local (caso não tenha exportado do App)
  const getTodayLocal = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
  };

  const [date, setDate] = useState(getTodayLocal());
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [editingId, setEditingId] = useState(null);
  
  const [records, setRecords] = useState({
    entrada1: '', saida1: '', entrada2: '', saida2: '', obs: ''
  });

  const setTimeNow = (field) => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    setRecords(prev => ({ ...prev, [field]: `${h}:${m}` }));
  };

  const formatarTempo = (minutos) => {
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    if (h === 0 && m === 0) return '00h 00m';
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  const calcularSaldoDiario = (ponto) => {
    const funcJornada = db.jornadas.find(j => j.funcionarioId === ponto.funcionarioId);
    if (!funcJornada) return '-';

    const e1 = ponto.entrada1 ? timeToMinutes(ponto.entrada1) : null;
    const s1 = ponto.saida1 ? timeToMinutes(ponto.saida1) : null;
    const e2 = ponto.entrada2 ? timeToMinutes(ponto.entrada2) : null;
    const s2 = ponto.saida2 ? timeToMinutes(ponto.saida2) : null;

    let minsTrabalhados = 0;
    if (e1 !== null && s1 !== null && e2 !== null && s2 !== null) {
       minsTrabalhados = (s1 - e1) + (s2 - e2);
    } else if (e1 !== null && s1 !== null && e2 === null && s2 === null) {
       minsTrabalhados = s1 - e1;
    } else if (e1 !== null && s1 === null && e2 === null && s2 !== null) {
       minsTrabalhados = s2 - e1;
    } else {
       const turno1 = (s1 !== null && e1 !== null && s1 > e1) ? (s1 - e1) : 0;
       const turno2 = (s2 !== null && e2 !== null && s2 > e2) ? (s2 - e2) : 0;
       minsTrabalhados = turno1 + turno2;
    }

    if (minsTrabalhados < 0) minsTrabalhados = 0;

    const diasMapa = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const [pAno, pMes, pDia] = ponto.data.split('-');
    const dateObj = new Date(pAno, pMes - 1, pDia);
    const diaSemana = diasMapa[dateObj.getDay()];

    const configDia = funcJornada[diaSemana];
    let minsEsperados = 0;

    if (configDia && configDia.ativo) {
       const expE = timeToMinutes(configDia.entrada);
       const expS = timeToMinutes(configDia.saida);
       const expI = timeToMinutes(configDia.intervalo);
       if (expS > expE) {
          minsEsperados = (expS - expE) - expI;
       }
    }

    const isFolga = !configDia || !configDia.ativo;

    if (diaSemana === 'domingo' || isFolga) {
       if (minsTrabalhados === 0) return '-';
       return <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">+{formatarTempo(minsTrabalhados)}</span>;
    }

    const saldo = minsTrabalhados - minsEsperados;
    if (saldo === 0) return <span className="text-slate-400">00h 00m</span>;
    if (saldo > 0) return <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">+{formatarTempo(saldo)}</span>;
    return <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded">-{formatarTempo(Math.abs(saldo))}</span>;
  };

  const handleSavePonto = () => {
    if (!selectedFuncId || !date) return showToast('Preencha funcionário e data', 'error');
    const pontoData = { funcionarioId: selectedFuncId, data: date, ...records };
    
    if (editingId) {
      StorageService.updateRegistroPonto(editingId, pontoData);
      showToast('Ponto atualizado com sucesso!');
    } else {
      StorageService.saveRegistroPonto(pontoData);
      showToast('Ponto registrado com sucesso!');
    }
    refreshData();
    cancelarEdicao();
  };

  const handleEdit = (ponto) => {
    setEditingId(ponto.id);
    setSelectedFuncId(ponto.funcionarioId);
    setDate(ponto.data);
    setRecords({ entrada1: ponto.entrada1 || '', saida1: ponto.saida1 || '', entrada2: ponto.entrada2 || '', saida2: ponto.saida2 || '', obs: ponto.obs || '' });
  };

  const handleDelete = (id) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
      StorageService.deleteRegistroPonto(id);
      showToast('Registro excluído com sucesso');
      refreshData();
    }
  };

  const cancelarEdicao = () => {
    setEditingId(null);
    setRecords({ entrada1: '', saida1: '', entrada2: '', saida2: '', obs: '' });
  };

  const renderTimeInput = (label, field) => (
    <div className="flex flex-col space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <button 
          type="button"
          onClick={() => setTimeNow(field)}
          className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors"
        >
          Agora
        </button>
      </div>
      <input 
        type="time" 
        value={records[field]} 
        onChange={e => setRecords({...records, [field]: e.target.value})}
        className="w-full px-3 py-3 border border-slate-300 rounded-lg text-lg text-center font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm transition-all"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Controle de Ponto</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 space-y-5 h-fit bg-slate-50 border-2">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="font-bold text-lg text-slate-800">
              {editingId ? 'Editar Registro' : 'Lançamento Manual'}
            </h3>
            {editingId && <button onClick={cancelarEdicao} className="text-sm text-slate-500 hover:text-slate-700 font-medium">Cancelar</button>}
          </div>

          <Select 
            label="Funcionário" 
            value={selectedFuncId} 
            onChange={(e) => setSelectedFuncId(e.target.value)} 
            options={[{ label: 'Selecione...', value: '' }, ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))]} 
          />
          
          <div className="flex flex-col space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">Data do Registro</label>
              <button 
                type="button"
                onClick={() => setDate(getTodayLocal())}
                className="text-[11px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded hover:bg-indigo-100 transition-colors"
              >
                Hoje
              </button>
            </div>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-3 border border-slate-300 rounded-lg text-lg text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2">
            {renderTimeInput("Entrada", "entrada1")}
            {renderTimeInput("Saída Int.", "saida1")}
            {renderTimeInput("Retorno Int.", "entrada2")}
            {renderTimeInput("Saída Final", "saida2")}
          </div>
          
          <div className="flex flex-col space-y-1 pt-2">
             <label className="text-sm font-medium text-slate-700">Observações</label>
             <textarea className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-indigo-500" rows="2" value={records.obs} onChange={e => setRecords({...records, obs: e.target.value})} placeholder="Atrasos, atestados, etc..."></textarea>
          </div>

          <div className="flex space-x-2 pt-4 border-t border-slate-200">
            {editingId && <Button className="flex-1 justify-center" variant="secondary" onClick={cancelarEdicao}>Cancelar</Button>}
            <Button className="flex-1 justify-center py-3 text-lg shadow-md hover:shadow-lg transition-shadow" icon={editingId ? CheckCircle : Clock} onClick={handleSavePonto}>{editingId ? 'Atualizar' : 'Salvar Registro'}</Button>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-0 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Últimos Registros</h3>
          </div>
          <div className="flex-1 overflow-x-auto p-0 bg-white">
             <table className="w-full text-left text-sm text-slate-600 min-w-[700px]">
                <thead className="bg-slate-50 text-slate-700 font-medium sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Data</th>
                    <th className="px-4 py-3 whitespace-nowrap">Funcionário</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Entrada</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Intervalo</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Saída</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Saldo do Dia</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.pontos.slice().reverse().slice(0, 15).map((p, i) => {
                    const func = db.funcionarios.find(f => f.id === p.funcionarioId);
                    return (
                      <tr key={p.id || i} className={`hover:bg-slate-50 transition-colors ${editingId === p.id ? 'bg-indigo-50' : ''}`}>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.data)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{func ? func.nome : 'Desconhecido'}</td>
                        <td className="px-4 py-3 text-center font-mono bg-emerald-50/50">{p.entrada1 || '-'}</td>
                        <td className="px-4 py-3 text-center font-mono text-slate-500 whitespace-nowrap">{p.saida1 || '-'} / {p.entrada2 || '-'}</td>
                        <td className="px-4 py-3 text-center font-mono bg-orange-50/50">{p.saida2 || '-'}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">{calcularSaldoDiario(p)}</td>
                        <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                          <button onClick={() => handleEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors rounded-full hover:bg-indigo-50" title="Editar"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50" title="Excluir"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {db.pontos.length === 0 && <tr><td colSpan="7" className="px-4 py-12 text-center text-slate-400 bg-slate-50">Nenhum registro de ponto encontrado.</td></tr>}
                </tbody>
             </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

const FolhaPagamento = () => {
  const { db, showToast } = useAppContext();
  
  // Função auxiliar para calcular o período padrão (26 do mês passado a 25 do mês atual)
  const getPeriodoPadrao = () => {
    const hoje = new Date();
    let anoAtual = hoje.getFullYear();
    let mesAtual = hoje.getMonth() + 1; // 1 a 12
    let mesAnterior = mesAtual - 1;
    let anoAnterior = anoAtual;

    if (mesAnterior === 0) {
      mesAnterior = 12;
      anoAnterior -= 1;
    }

    const dataIni = `${anoAnterior}-${String(mesAnterior).padStart(2, '0')}-26`;
    const dataFim = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-25`;
    return { dataIni, dataFim };
  };

  const periodoPadrao = getPeriodoPadrao();
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [dataInicio, setDataInicio] = useState(periodoPadrao.dataIni);
  const [dataFim, setDataFim] = useState(periodoPadrao.dataFim);
  
  const [calculoRealizado, setCalculoRealizado] = useState(null);

  const formatarTempo = (minutos) => {
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    if (h === 0 && m === 0) return '00h 00m';
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  const processarFolha = () => {
    if (!selectedFuncId || !dataInicio || !dataFim) return showToast('Preencha funcionário e período', 'error');
    if (dataInicio > dataFim) return showToast('A data de início deve ser anterior à data final', 'error');

    const funcionario = db.funcionarios.find(f => f.id === selectedFuncId);
    const jornada = db.jornadas.find(j => j.funcionarioId === selectedFuncId);
    const salarioBase = Number(funcionario.salario) || 0;
    
    if (!jornada) return showToast('Funcionário sem jornada cadastrada', 'error');
    
    // Filtra considerando o range de datas
    const pontosPeriodo = db.pontos.filter(p => {
      if(p.funcionarioId !== selectedFuncId) return false;
      return p.data >= dataInicio && p.data <= dataFim;
    });

    const weeklyHrs = calculateWeeklyHours(jornada);
    const monthlyHrs = calculateMonthlyHours(weeklyHrs);
    const valorHora = salarioBase / monthlyHrs;

    let totalMinutosTrabalhados = 0;
    let totalMinutosExtras50 = 0;
    let totalMinutosExtras100 = 0;
    let totalMinutosFalta = 0;

    const diasMapa = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

    pontosPeriodo.forEach(p => {
      const e1 = p.entrada1 ? timeToMinutes(p.entrada1) : null;
      const s1 = p.saida1 ? timeToMinutes(p.saida1) : null;
      const e2 = p.entrada2 ? timeToMinutes(p.entrada2) : null;
      const s2 = p.saida2 ? timeToMinutes(p.saida2) : null;

      let minsTrabalhados = 0;

      if (e1 !== null && s1 !== null && e2 !== null && s2 !== null) {
         minsTrabalhados = (s1 - e1) + (s2 - e2);
      } else if (e1 !== null && s1 !== null && e2 === null && s2 === null) {
         minsTrabalhados = s1 - e1;
      } else if (e1 !== null && s1 === null && e2 === null && s2 !== null) {
         minsTrabalhados = s2 - e1;
      } else {
         const turno1 = (s1 !== null && e1 !== null && s1 > e1) ? (s1 - e1) : 0;
         const turno2 = (s2 !== null && e2 !== null && s2 > e2) ? (s2 - e2) : 0;
         minsTrabalhados = turno1 + turno2;
      }

      if (minsTrabalhados < 0) minsTrabalhados = 0;
      totalMinutosTrabalhados += minsTrabalhados;

      const [pAno, pMes, pDia] = p.data.split('-');
      const dateObj = new Date(pAno, pMes - 1, pDia);
      const diaSemana = diasMapa[dateObj.getDay()];

      const configDia = jornada[diaSemana];
      let minsEsperados = 0;

      if (configDia && configDia.ativo) {
         const expE = timeToMinutes(configDia.entrada);
         const expS = timeToMinutes(configDia.saida);
         const expI = timeToMinutes(configDia.intervalo);
         if (expS > expE) {
            minsEsperados = (expS - expE) - expI;
         }
      }

      const isFolga = !configDia || !configDia.ativo;

      if (diaSemana === 'domingo' || isFolga) {
         totalMinutosExtras100 += minsTrabalhados;
         if (minsTrabalhados < minsEsperados) {
             totalMinutosFalta += (minsEsperados - minsTrabalhados);
         }
      } else {
         if (minsTrabalhados > minsEsperados) {
            totalMinutosExtras50 += (minsTrabalhados - minsEsperados);
         } else if (minsTrabalhados < minsEsperados) {
            totalMinutosFalta += (minsEsperados - minsTrabalhados);
         }
      }
    });

    const horasExtras50 = totalMinutosExtras50 / 60;
    const horasExtras100 = totalMinutosExtras100 / 60;
    const horasFalta = totalMinutosFalta / 60;

    const valorHE50 = horasExtras50 * valorHora * 1.5;
    const valorHE100 = horasExtras100 * valorHora * 2.0;
    const valorFaltas = horasFalta * valorHora;
    const INSS = salarioBase * 0.075; 

    const liquido = salarioBase + valorHE50 + valorHE100 - valorFaltas - INSS;

    setCalculoRealizado({
      funcionario, dataInicio, dataFim, salarioBase, valorHora, 
      monthlyHrsMinutos: monthlyHrs * 60,
      totalMinutosExtras50, valorHE50, 
      totalMinutosExtras100, valorHE100,
      totalMinutosFalta, valorFaltas, INSS, liquido,
      qtdRegistros: pontosPeriodo.length
    });
    showToast('Cálculo gerado com sucesso!');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Folha de Pagamento</h1>

      <Card className="bg-slate-50 border-dashed border-2 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <Select 
                label="Funcionário" 
                value={selectedFuncId} 
                onChange={(e) => setSelectedFuncId(e.target.value)}
                options={[{ label: 'Selecione...', value: '' }, ...db.funcionarios.map(f => ({ label: f.nome, value: f.id }))]}
            />
          </div>
          <div className="md:col-span-1">
            <Input label="Período Inicial" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <Input label="Período Final" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <Button icon={FileText} className="w-full h-[42px] justify-center" onClick={processarFolha}>Processar Holerite</Button>
          </div>
        </div>
      </Card>

      {calculoRealizado && (
        <Card className="max-w-3xl mx-auto p-0 overflow-hidden shadow-md">
          <div className="bg-slate-800 text-white p-4 md:p-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
             <div>
                <h2 className="text-xl font-bold">Recibo de Pagamento</h2>
                <p className="text-slate-300 text-sm opacity-80">{calculoRealizado.funcionario.nome} - Ref: {formatDate(calculoRealizado.dataInicio)} a {formatDate(calculoRealizado.dataFim)}</p>
             </div>
             <div className="text-left md:text-right">
                <p className="text-sm opacity-80">Valor Hora</p>
                <p className="font-mono text-lg">{formatCurrency(calculoRealizado.valorHora)}</p>
             </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-6 py-3 text-left whitespace-nowrap">Descrição</th>
                  <th className="px-6 py-3 text-center whitespace-nowrap">Referência</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">Vencimentos</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">Descontos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-6 py-4 font-medium whitespace-nowrap">Salário Base (Mensal)</td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">{formatarTempo(calculoRealizado.monthlyHrsMinutos)}</td>
                  <td className="px-6 py-4 text-right text-green-600 whitespace-nowrap">{formatCurrency(calculoRealizado.salarioBase)}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap"></td>
                </tr>
                {calculoRealizado.totalMinutosExtras50 > 0 && (
                  <tr>
                    <td className="px-6 py-4 font-medium whitespace-nowrap">Horas Extras 50%</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">{formatarTempo(calculoRealizado.totalMinutosExtras50)}</td>
                    <td className="px-6 py-4 text-right text-green-600 whitespace-nowrap">{formatCurrency(calculoRealizado.valorHE50)}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap"></td>
                  </tr>
                )}
                {calculoRealizado.totalMinutosExtras100 > 0 && (
                  <tr>
                    <td className="px-6 py-4 font-medium whitespace-nowrap">Horas Extras 100% (Dom/Folga)</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">{formatarTempo(calculoRealizado.totalMinutosExtras100)}</td>
                    <td className="px-6 py-4 text-right text-green-600 whitespace-nowrap">{formatCurrency(calculoRealizado.valorHE100)}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap"></td>
                  </tr>
                )}
                {calculoRealizado.totalMinutosFalta > 0 && (
                  <tr>
                    <td className="px-6 py-4 font-medium whitespace-nowrap">Atrasos / Faltas</td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">{formatarTempo(calculoRealizado.totalMinutosFalta)}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap"></td>
                    <td className="px-6 py-4 text-right text-red-600 whitespace-nowrap">{formatCurrency(calculoRealizado.valorFaltas)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-6 py-4 font-medium whitespace-nowrap">INSS (Estimado)</td>
                  <td className="px-6 py-4 text-center whitespace-nowrap">7.5%</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap"></td>
                  <td className="px-6 py-4 text-right text-red-600 whitespace-nowrap">{formatCurrency(calculoRealizado.INSS)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan="2" className="px-6 py-4 font-bold text-slate-700 text-right whitespace-nowrap">Líquido a Receber:</td>
                  <td colSpan="2" className="px-6 py-4 text-right whitespace-nowrap">
                    <span className="text-2xl font-bold text-indigo-700">{formatCurrency(calculoRealizado.liquido)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 bg-yellow-50 text-yellow-800 text-xs border-t border-yellow-200">
            * Baseado em {calculoRealizado.qtdRegistros} registros de ponto encontrados entre {formatDate(calculoRealizado.dataInicio)} e {formatDate(calculoRealizado.dataFim)}.
          </div>
        </Card>
      )}
    </div>
  );
};

const Backup = () => {
  const { showToast, refreshData } = useAppContext();

  const handleExport = () => {
    const dataStr = StorageService.exportData();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `baba_manager_backup_${new Date().toISOString().split('T')[0]}.json`;

    let linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    showToast('Backup exportado com sucesso!');
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const success = StorageService.importData(event.target.result);
      if (success) {
        showToast('Dados restaurados com sucesso!');
        refreshData();
      } else {
        showToast('Arquivo de backup inválido', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Backup e Restauração</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="flex flex-col items-center justify-center text-center p-10 space-y-4">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
            <Download size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Exportar Dados</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">Gera um arquivo JSON contendo todos os cadastros, jornadas e registros de ponto salvos no navegador.</p>
          </div>
          <Button icon={Download} onClick={handleExport} className="mt-4">Baixar Arquivo .json</Button>
        </Card>

        <Card className="flex flex-col items-center justify-center text-center p-10 space-y-4">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
            <Upload size={32} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Restaurar Dados</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">Importa um arquivo JSON de backup. Atenção: Isso irá substituir os dados atuais.</p>
          </div>
          <div className="mt-4 relative">
            <Button icon={Upload} variant="secondary">Selecionar Arquivo</Button>
            <input type="file" accept=".json" onChange={handleImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </div>
        </Card>
      </div>
    </div>
  );
};

// ==========================================
// 7. LAYOUT & NAVIGATION
// ==========================================
const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
      ${active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
  >
    <Icon size={20} className={active ? 'text-indigo-200' : 'text-slate-400'} />
    <span>{label}</span>
    {active && <ChevronRight size={16} className="ml-auto text-indigo-300" />}
  </button>
);

const AppLayout = () => {
  const { currentRoute, setCurrentRoute } = useAppContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'funcionarios', label: 'Funcionários', icon: Users },
    { id: 'jornadas', label: 'Jornadas', icon: Calendar },
    { id: 'ponto', label: 'Controle de Ponto', icon: Clock },
    { id: 'folha', label: 'Folha de Pagamento', icon: DollarSign },
    { id: 'backup', label: 'Backup/Config', icon: Settings },
  ];

  const renderContent = () => {
    switch (currentRoute) {
      case 'dashboard': return <Dashboard />;
      case 'funcionarios': return <FuncionariosList />;
      case 'jornadas': return <JornadasTrabalho />;
      case 'ponto': return <ControlePonto />;
      case 'folha': return <FolhaPagamento />;
      case 'backup': return <Backup />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 bg-white w-64 border-r border-slate-200 flex flex-col z-50 transform transition-transform duration-300 lg:translate-x-0 lg:static lg:block ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <div className="flex items-center space-x-2 text-indigo-600">
            <Coffee size={28} />
            <span className="text-xl font-black tracking-tight">BabáManager</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          {menuItems.map(item => (
            <SidebarItem 
              key={item.id} 
              icon={item.icon} 
              label={item.label} 
              active={currentRoute === item.id}
              onClick={() => { setCurrentRoute(item.id); setIsMobileMenuOpen(false); }} 
            />
          ))}
        </div>
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center space-x-3 px-2 py-2 rounded-lg bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">FS</div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700">Marcello Mendes</span>
              <span className="text-[10px] text-slate-500">Local DB</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 shadow-sm">
          <div className="flex items-center lg:hidden">
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-500 hover:text-indigo-600 focus:outline-none">
              <Menu size={24} />
            </button>
          </div>
          <div className="hidden lg:flex items-center text-sm text-slate-500 font-medium">
            <Briefcase size={16} className="mr-2" /> Visão Geral do Empregador
          </div>
          <div className="flex items-center space-x-4">
             <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium">Vercel Ready</span>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 8. ROOT APP COMPONENT
// ==========================================
export default function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}