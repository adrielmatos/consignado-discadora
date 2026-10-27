import { siteConfig } from "@/config/site";
import { DollarSign, PhoneCall, TrendingUp, Award } from "lucide-react";

const icons = [DollarSign, PhoneCall, TrendingUp, Award];

export default function MetricsBar() {
  return (
    <section className="relative z-20 -mt-6 sm:-mt-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {siteConfig.metrics.map((metric, index) => {
          const Icon = icons[index % icons.length];
          return (
            <div
              key={index}
              className="bg-navy-900/90 backdrop-blur-md rounded-2xl p-5 border border-navy-700/80 shadow-xl shadow-navy-950/60 hover:border-brand-blue/50 transition-all group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-300">
                  {metric.label}
                </span>
                <div className="w-8 h-8 rounded-lg bg-navy-850 flex items-center justify-center text-amber-400 group-hover:bg-amber-400 group-hover:text-navy-950 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
                  {metric.value}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 font-medium leading-relaxed">
                {metric.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
