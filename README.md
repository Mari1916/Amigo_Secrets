# Amigo Secreto

Site simples para cadastrar participantes, sortear sem que alguém tire a si mesmo e enviar uma senha individual por e-mail. O resultado de cada pessoa só é mostrado depois de entrar com o e-mail cadastrado e a senha recebida.

## Requisitos

- Node.js 18 ou superior
- Uma conta de e-mail com acesso SMTP (use senha de aplicativo quando o provedor exigir)

## Rodar localmente

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell) e preencha as configurações:
   - `ADMIN_KEY`: chave do organizador com pelo menos 16 caracteres.
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` e `SMTP_PASS`: dados SMTP do provedor.
   - `MAIL_FROM`: nome e endereço que aparecerão como remetente.
   - `SITE_URL`: endereço público do site, para incluí-lo no e-mail; deixe vazio para não incluir o link.
3. Inicie o site com `npm start`.
4. Abra `http://localhost:3000`.
5. Os participantes cadastram nome e e-mail. Em **Área do organizador**, informe `ADMIN_KEY`, confira a lista e faça o sorteio.

As senhas são aleatórias e ficam armazenadas apenas como hashes. Se algum envio falhar, abra novamente a área do organizador, carregue os participantes e use **Reenviar senha** para os e-mails pendentes. Cada reenvio emite uma nova senha para aquele participante.

Os dados do sorteio ficam em `data/store.json`; proteja esse arquivo e faça cópias de segurança. A sessão de acesso expira após 12 horas. Para uso público, hospede o site com HTTPS e mantenha `.env` e a pasta `data` fora do acesso público.

## Publicar na Railway

1. Envie o projeto para um repositório no GitHub. Não envie `.env`, `node_modules` nem a pasta `data`; eles já estão no `.gitignore`.
2. Na Railway, crie um projeto e implante o repositório do GitHub. O comando de inicialização é `npm start`.
3. Adicione um **Volume** ao serviço e monte-o em `/data`. Nas variáveis do serviço, configure `DATA_DIR=/data` para guardar os cadastros e o resultado no volume persistente.
4. Configure as variáveis `ADMIN_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` com seus valores reais. Defina também `NODE_ENV=production`. Não publique essas credenciais no GitHub.
5. Gere um domínio público nas configurações de rede do serviço e configure `SITE_URL` com esse endereço `https://...`. Depois, faça um novo deploy.

Compartilhe o endereço `https://...` com as participantes. O site de cadastro é público; apenas a área de organização exige `ADMIN_KEY`, e cada resultado exige a senha recebida por e-mail.
