import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="QuadERP Logo" className="h-8 w-auto" />
            <span className="text-xl font-bold tracking-tight text-white">QuadERP</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link to="/login" className="px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/25">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-32 pb-16 px-6 lg:pt-48 lg:pb-32 relative overflow-hidden">
        {/* Abstract Background Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 tracking-tight leading-tight mb-8">
            The intelligent OS <br className="hidden md:block" /> for modern retail.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Unify your Point of Sale, Inventory, and Financials in one beautifully designed platform. Scale your business effortlessly with QuadERP.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/login" className="w-full sm:w-auto px-8 py-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-xl shadow-indigo-500/20 text-lg">
              Launch App
            </Link>
            <a href="#features" className="w-full sm:w-auto px-8 py-4 rounded-full bg-slate-800 hover:bg-slate-700 text-white font-medium transition-all text-lg">
              Explore Features
            </a>
          </div>
        </div>

        {/* Dashboard Preview Mockup */}
        <div className="mt-20 max-w-6xl mx-auto relative group perspective-1000">
          <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative rounded-2xl bg-slate-900 border border-slate-800 p-2 shadow-2xl overflow-hidden transform transition-transform duration-500">
            <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800/50 relative aspect-[16/9] flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800/50 to-slate-900/50 flex flex-col">
                {/* Faux Header */}
                <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                {/* Faux Content */}
                <div className="flex-1 flex p-4 gap-4">
                  <div className="w-64 bg-slate-800/30 rounded-lg hidden md:block" />
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex gap-4 h-32">
                      <div className="flex-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
                        <div className="w-24 h-4 bg-indigo-400/20 rounded mb-2" />
                        <div className="w-32 h-8 bg-indigo-400/30 rounded" />
                      </div>
                      <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                        <div className="w-24 h-4 bg-emerald-400/20 rounded mb-2" />
                        <div className="w-32 h-8 bg-emerald-400/30 rounded" />
                      </div>
                      <div className="flex-1 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 hidden sm:block">
                        <div className="w-24 h-4 bg-blue-400/20 rounded mb-2" />
                        <div className="w-32 h-8 bg-blue-400/30 rounded" />
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-800/30 rounded-lg p-4 flex flex-col gap-3">
                      <div className="w-full h-8 bg-slate-700/30 rounded" />
                      <div className="w-full h-8 bg-slate-700/30 rounded" />
                      <div className="w-full h-8 bg-slate-700/30 rounded" />
                      <div className="w-full h-8 bg-slate-700/30 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="py-24 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Everything you need to grow</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">QuadERP brings enterprise-grade tools to your business without the complexity.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon="💳"
              title="Lightning POS"
              description="Process sales instantly, handle split payments seamlessly, and keep checkout lines moving."
            />
            <FeatureCard 
              icon="📦"
              title="Smart Inventory"
              description="Real-time stock tracking, automatic low-stock alerts, and multi-location management."
            />
            <FeatureCard 
              icon="📈"
              title="Financial ledgers"
              description="Built-in Accounts Receivable, Accounts Payable, and automated profit & loss statements."
            />
            <FeatureCard 
              icon="👥"
              title="CRM & Loyalty"
              description="Reward your best customers, track purchase history, and manage store deposits securely."
            />
            <FeatureCard 
              icon="📱"
              title="Mobile Ready"
              description="Access your dashboard and run sales directly from any tablet or mobile device."
            />
            <FeatureCard 
              icon="🔒"
              title="Enterprise Security"
              description="Role-based permissions, automated backups, and secure cloud infrastructure."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-900/20" />
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to transform your business?</h2>
          <p className="text-xl text-slate-300 mb-10">Join the platform built for modern retail excellence.</p>
          <Link to="/login" className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-white text-indigo-950 hover:bg-slate-100 font-bold transition-all text-lg shadow-xl shadow-white/10">
            Sign in to Dashboard
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/logo-mono.svg" alt="QuadERP Logo" className="h-6 w-auto opacity-50" />
            <span className="text-slate-500 font-medium">© {new Date().getFullYear()} QuadERP. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link to="#" className="text-slate-500 hover:text-slate-300">Privacy Policy</Link>
            <Link to="#" className="text-slate-500 hover:text-slate-300">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8 hover:bg-slate-800 transition-colors">
      <div className="text-4xl mb-6">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}
