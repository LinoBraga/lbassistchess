import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="border-b border-ink-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-5 flex items-center justify-between">
          <Logo size="sm" />
          <Link to="/">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>Voltar</Button>
          </Link>
        </div>
      </div>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-brand-300" />
          </div>
          <h1 className="text-2xl font-bold text-content-primary">Política de Privacidade</h1>
        </div>
        <p className="text-sm text-content-secondary">
          Esta política descreve como o LB Assist Chess coleta, usa e protege
          seus dados. Resumo acessível, sem jargão desnecessário.
        </p>

        <Section title="Dados que coletamos">
          <ul>
            <li><b>E-mail e nome de exibição:</b> para criar e identificar sua conta.</li>
            <li><b>Partidas importadas:</b> PGNs vindos do Chess.com, Lichess ou upload direto. São usados para análise e diagnóstico.</li>
            <li><b>Preferências de treinamento:</b> plataforma, controle de tempo, tempo de estudo e objetivo. Usados para personalizar o treino.</li>
            <li><b>Resultados de exercícios:</b> tentativas, acertos e revisões, para medir aprendizagem.</li>
            <li><b>Nomes de usuário públicos:</b> de Chess.com ou Lichess, apenas o nome público — nunca senhas.</li>
          </ul>
        </Section>

        <Section title="Como usamos seus dados">
          <ul>
            <li>Para analisar suas partidas com Stockfish e gerar diagnóstico.</li>
            <li>Para selecionar exercícios e montar seu plano semanal.</li>
            <li>Para acompanhar sua evolução ao longo do tempo.</li>
            <li>Não vendemos nem compartilhamos seus dados com terceiros para marketing.</li>
          </ul>
        </Section>

        <Section title="Isolamento e segurança">
          <ul>
            <li>Cada usuário acessa apenas seus próprios dados (Row Level Security).</li>
            <li>Chaves administrativas nunca são expostas no navegador.</li>
            <li>Operações caras (análise de engine) são validadas e controladas no backend.</li>
            <li>Validação de arquivos PGN e limites de upload são aplicados.</li>
          </ul>
        </Section>

        <Section title="Exclusão da conta">
          <p>Você pode solicitar a exclusão da sua conta e dos seus dados. A exclusão é irreversível e remove partidas, análises, exercícios e histórico.</p>
        </Section>

        <Section title="Contato">
          <p>Dúvidas sobre privacidade podem ser enviadas pelo canal de suporte da plataforma.</p>
        </Section>

        <p className="text-xs text-content-muted">Última atualização: outubro de 2026.</p>
      </article>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="min-h-screen bg-ink">
      <div className="border-b border-ink-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-5 flex items-center justify-between">
          <Logo size="sm" />
          <Link to="/">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>Voltar</Button>
          </Link>
        </div>
      </div>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-12 space-y-6">
        <h1 className="text-2xl font-bold text-content-primary">Termos de Uso</h1>
        <p className="text-sm text-content-secondary">
          Ao usar o LB Assist Chess, você concorda com estes termos.
        </p>

        <Section title="Natureza do serviço">
          <p>O LB Assist Chess é uma plataforma de análise e treinamento de xadrez. Não promete aumentos garantidos de rating. Os resultados das análises são gerados por engine (Stockfish) e baseados nas partidas fornecidas pelo usuário.</p>
        </Section>

        <Section title="Uso aceitável">
          <ul>
            <li>Não use credenciais de terceiros nem nomes de usuário que não sejam seus.</li>
            <li>Não tente abusar dos limites de análise ou contornar restrições do sistema.</li>
            <li>Respeite os termos das APIs do Chess.com e do Lichess.</li>
          </ul>
        </Section>

        <Section title="Assinatura">
          <p>O plano Pro é uma assinatura mensal recorrente. O status da assinatura só é atualizado após confirmação verificada do pagamento. Você pode cancelar a qualquer momento.</p>
        </Section>

        <Section title="Licença do Stockfish">
          <p>O Stockfish é software livre, distribuído sob licença GPLv3. Os créditos e obrigações de distribuição aplicáveis estão disponíveis no site oficial do Stockfish.</p>
        </Section>

        <Section title="Limitação de responsabilidade">
          <p>A plataforma fornece análise e treinamento baseados em dados. Conclusões podem variar conforme a qualidade e a quantidade das partidas fornecidas. Não há garantia de resultados competitivos.</p>
        </Section>

        <p className="text-xs text-content-muted">Última atualização: outubro de 2026.</p>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-bold text-content-primary mb-3">{title}</h2>
      <div className="space-y-2 text-sm text-content-secondary leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_b]:text-content-primary">
        {children}
      </div>
    </section>
  );
}
