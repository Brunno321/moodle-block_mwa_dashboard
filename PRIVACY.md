# Privacidade e LGPD

## Controles implementados

- O processamento externo por IA vem desativado por padrão.
- A instituição precisa habilitar a IA, escolher um provedor oficial e informar sua própria chave de API.
- Somente papéis autorizados a usar IA ou gerenciar intervenções no curso podem acionar recursos externos.
- Nomes de estudantes são substituídos por aliases temporários antes da transmissão.
- O chat externo recebe somente indicadores agregados da turma e das atividades; nomes, e-mails, notas por aluno e listas individuais de acesso são descartados no servidor.
- Perguntas sobre estudantes específicos são desidentificadas, e a identificação para acompanhamento permanece local no Moodle.
- Dados educacionais são transmitidos somente para gerar análises, recomendações e apoio à decisão pedagógica quando a instituição habilita a IA.
- O processamento é enviado diretamente ao provedor selecionado: DeepSeek, OpenAI, Google Gemini ou Anthropic. A instituição deve avaliar a localização, retenção e os termos do provedor escolhido.
- E-mails e endereços IP encontrados em prompts são removidos no servidor.
- IDs de usuários Moodle não são usados nos aliases externos.
- Arquivos enviados por estudantes em atividades não são lidos pelo extrator de conteúdo.
- Endereços IP não são mais coletados na tabela de eventos do plugin.
- Dados antigos seguem retenção configurável e são eliminados por tarefa agendada.
- Intervenções exigem capacidade própria e destinatário matriculado e ativo no curso.
- O provedor escolhido é validado e enviado ao backend para tornar a seleção auditável.
- O provedor de privacidade do Moodle exporta e elimina logs, mensagens e snapshots.

## Responsabilidades institucionais

Estes controles reduzem riscos técnicos, mas não substituem a análise jurídica e de governança. Antes de ativar a IA, a instituição deve documentar finalidade e base legal, informar os titulares quando aplicável, avaliar necessidade e proporcionalidade, definir retenção, celebrar contrato com o operador, verificar suboperadores e transferências internacionais, estabelecer resposta a incidentes e manter registro das operações de tratamento.

Não existe backend intermediário do MWA. As políticas de logs, retenção, treinamento de modelos, localização, segurança e exclusão do provedor selecionado devem ser auditadas separadamente pela instituição.
