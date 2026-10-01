# KING BARBEARIA — sistema completo

## Recursos
- Site responsivo com visual premium e identidade de barbearia.
- Serviços e preços vindos do banco SQLite.
- Agenda real: o horário é bloqueado após a reserva, respeitando a duração do serviço e o intervalo de almoço.
- Horários que já passaram não aparecem como disponíveis (fuso configurável em `BUSINESS_TZ`).
- Formulário de agendamento com validação de nome, WhatsApp, data e horário.
- Painel `/admin.html` para consultar, cancelar e reativar reservas.
- Aviso opcional ao barbeiro via WhatsApp Cloud API da Meta.

## Rodar no Windows
1. Instale o Node.js LTS.
2. Abra o Prompt de Comando nesta pasta.
3. `npm install`
4. Ajuste o arquivo `.env` com senha e dados do sistema.
5. `npm start`
6. Acesse: http://localhost:3000 e http://localhost:3000/admin.html

## Publicação real

### Render
1. Crie um novo Web Service no Render.
2. Conecte o repositório do projeto.
3. Use o comando de build: `npm install`
4. Use o comando de start: `npm start`
5. Em `Environment Variables`, configure:
   - `PORT=3000`
   - `ADMIN_USER=admin`
   - `ADMIN_PASSWORD=sua_senha_forte`
   - `BUSINESS_TZ=America/Campo_Grande`
6. Ative um disco persistente em `/data` ou defina `DATA_DIR=/data` para manter o SQLite.
7. O serviço ficará no endereço gerado pelo Render.

### Railway
1. Crie um novo projeto no Railway.
2. Conecte o repositório e selecione a opção `Node`.
3. Defina o comando de start: `npm start`
4. Adicione as variáveis de ambiente do `.env`.
5. Se for usar persistência, configure um volume para `/data` e defina `DATA_DIR=/data`.

### VPS / Linux
1. Faça upload do projeto para a VPS.
2. Instale o Node.js 18+ e execute `npm install`.
3. Crie um `.env` com as variáveis sensíveis.
4. Inicie com `npm start` usando um processo supervisor como `pm2`.
5. Configure um Nginx ou proxy reverso para HTTPS e domínio próprio.

## Configuração para produção
- Defina uma senha forte para `ADMIN_PASSWORD`.
- Use HTTPS em produção.
- Hospede o Node.js e o SQLite em um ambiente com disco persistente ou migre para PostgreSQL/Supabase.
- Configure `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_TO` para ativar notificações automáticas.

## Horários de funcionamento
Edite no topo de `server.js`:
- `SLOTS`: horários de início oferecidos.
- `OPEN_BLOCKS`: janelas de atendimento em minutos (padrão 08–12 e 13–18).

Serviços e preços ficam na tabela `services` do arquivo `data/king.db`.

## WhatsApp
Preencha no `.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_TO`.
Sem essas credenciais o agendamento funciona normalmente; somente a notificação automática não é enviada.

## Segurança
- O painel usa autenticação por cabeçalhos com usuário e senha.
- O Node agora desativa a assinatura `x-powered-by` e aceita proxy em ambientes de produção.
- Evite expor a senha no código-fonte ou em repositórios públicos.
