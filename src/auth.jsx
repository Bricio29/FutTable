import React, { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import './auth.css'

const messages = {
  invalid_credentials: 'Confira o e-mail e a senha e tente novamente.',
  email_not_confirmed: 'Confirme seu e-mail pelo link enviado antes de entrar.',
  email_provider_disabled: 'O cadastro e o acesso por e-mail estão desativados neste campeonato.',
  email_address_invalid: 'Informe um endereço de e-mail válido.',
  email_address_not_authorized: 'O envio de e-mails para este endereço está indisponível.',
  weak_password: 'Use uma senha mais longa e varie as letras, números e símbolos.',
  same_password: 'Escolha uma senha diferente da atual.',
  signup_disabled: 'O cadastro de novas contas está desativado.',
  over_email_send_rate_limit: 'Aguarde alguns minutos antes de solicitar outro e-mail.',
  over_request_rate_limit: 'Muitas tentativas em seguida. Aguarde alguns minutos.',
  reauthentication_needed: 'Entre novamente na sua conta para alterar a senha.',
  otp_expired: 'Este link expirou. Solicite outro e-mail para continuar.',
}

function describeError(error) {
  if (/^error sending confirmation (?:e?mail)$/i.test(error?.message || '')) {
    return 'O serviço de acesso não conseguiu enviar o e-mail de confirmação. Avise quem administra o campeonato.'
  }
  return messages[error?.code] || (error?.status === 429 ? messages.over_request_rate_limit :
    'Não foi possível concluir. Confira sua conexão e tente novamente.')
}

const returnUrl = () => new URL('./', window.location.href).href

export function useAuth() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [client, setClient] = useState(null)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState('')
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    let active = true
    let subscription
    const controller = new AbortController()
    async function initialize() {
      try {
        const response = await fetch('/api/config', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error()
        const { url, key } = await response.json()
        if (!active) return
        if (!url || !key) {
          setReady(true)
          return
        }
        const { createClient } = await import('@supabase/supabase-js')
        if (!active) return
        const callback = new URL(window.location.href)
        const fragment = new URLSearchParams(callback.hash.slice(1))
        const callbackError = fragment.get('error_code') || callback.searchParams.get('error_code') ||
          fragment.get('error') || callback.searchParams.get('error')
        if (callbackError) {
          setLinkError(messages[callbackError] || 'Este link é inválido. Solicite um novo e-mail.')
          for (const key of ['error', 'error_code', 'error_description']) callback.searchParams.delete(key)
          callback.hash = ''
          window.history.replaceState(window.history.state, '', callback)
        }
        const supabase = createClient(url, key)
        setClient(supabase)
        const result = supabase.auth.onAuthStateChange((event, nextSession) => {
          if (!active) return
          if (event === 'PASSWORD_RECOVERY') setRecovery(true)
          if (event === 'SIGNED_OUT') setRecovery(false)
          setSession(nextSession)
          setReady(true)
        })
        subscription = result.data.subscription
      } catch {
        if (active) {
          setError('O serviço de acesso está indisponível. Tente recarregar a página.')
          setReady(true)
        }
      }
    }
    initialize()
    return () => {
      active = false
      controller.abort()
      subscription?.unsubscribe()
    }
  }, [])

  async function signOut() {
    if (!client) return
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
  }

  return {
    session, ready, configured: Boolean(client), client, signOut, error, recovery, linkError,
    dismissLink: () => { setRecovery(false); setLinkError('') },
  }
}

const titles = {
  login: 'Entrar no FutTable',
  signup: 'Criar conta',
  forgot: 'Recuperar senha',
  update: 'Definir nova senha',
  account: 'Minha conta',
  confirm: 'Confirme seu e-mail',
  sent: 'Confira seu e-mail',
  link: 'Link de acesso inválido',
}

const viewKey = auth => auth.recovery ? 'recovery' : auth.linkError ? 'link' : 'normal'

export function AuthScreen({ auth }) {
  return <main className="auth-screen">
    <div className="auth-pitch">
      <div className="auth-wordmark" aria-label="FutTable">
        <img src="/campo.svg" alt="" width="42" height="42" />
        <span>Fut<b>Table</b></span>
      </div>
      <p className="auth-pitch-title">Gestão de<br/><em>campeonatos.</em></p>
    </div>
    <section className="auth-entry auth-content" aria-labelledby="auth-title">
      <AuthContent key={viewKey(auth)} auth={auth} onDone={auth.dismissLink} />
    </section>
  </main>
}

export function AuthDialog({ auth, open, onClose }) {
  const dialog = useRef(null)
  const visible = open || auth.recovery || Boolean(auth.linkError)
  useEffect(() => {
    const element = dialog.current
    if (!visible || !element) return
    element.showModal()
    return () => element.close()
  }, [visible])
  if (!visible) return null
  function close() {
    auth.dismissLink()
    onClose()
  }
  return <dialog ref={dialog} className="auth-dialog auth-content" aria-labelledby="auth-title"
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => {
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
    }}>
    <button type="button" className="auth-close" aria-label="Fechar" onClick={close}>×</button>
    <AuthContent key={viewKey(auth)} auth={auth} onDone={close} modal />
  </dialog>
}

function PasswordField({ label, description = 'senha', ...inputProps }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return <div className="auth-password">
    <label htmlFor={id}>{label}</label>
    <div className="auth-password-input">
      <input {...inputProps} id={id} required type={visible ? 'text' : 'password'} />
      <button type="button" className="auth-password-toggle" aria-controls={id}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${description}`} onClick={() => setVisible(!visible)}>
        <Icon size={19} aria-hidden="true" />
      </button>
    </div>
  </div>
}

function AuthContent({ auth, onDone, modal = false }) {
  const [mode, setMode] = useState(auth.recovery ? 'update' : auth.linkError ? 'link' : auth.session ? 'account' : 'login')
  const [email, setEmail] = useState(auth.session?.user?.email || '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState(auth.linkError)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef(false)
  const pending = useRef(false)
  useEffect(() => {
    if (!modal) document.title = `${mode === 'login' ? 'Entrar' : titles[mode]} · FutTable`
  }, [mode, modal])
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  function changeMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmation('')
  }

  async function run(action) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (err) {
      if (active.current) setError(describeError(err))
    } finally {
      pending.current = false
      if (active.current) setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    if (!auth.ready || !auth.configured) return
    if ((mode === 'signup' || mode === 'update') && password !== confirmation) {
      setError('As senhas precisam ser iguais.')
      return
    }
    run(async () => {
      const credentials = { email: email.trim(), password }
      const api = auth.client.auth
      let result
      if (mode === 'signup') {
        result = await api.signUp({ ...credentials, options: { emailRedirectTo: returnUrl() } })
      } else if (mode === 'forgot') {
        result = await api.resetPasswordForEmail(credentials.email, { redirectTo: returnUrl() })
      } else if (mode === 'update') {
        result = await api.updateUser({ password })
      } else {
        result = await api.signInWithPassword(credentials)
      }
      if (result.error) throw result.error
      if (!active.current) return
      if (mode === 'signup' && !result.data.session) changeMode('confirm')
      else if (mode === 'forgot') changeMode('sent')
      else onDone()
    })
  }

  const form = ['login', 'signup', 'forgot', 'update'].includes(mode)
  const newPassword = mode === 'signup' || mode === 'update'
  const available = auth.ready && auth.configured
  const submitLabel = { login: 'Entrar', forgot: 'Enviar link', signup: 'Criar conta', update: 'Salvar senha' }[mode]
  const Heading = modal ? 'h2' : 'h1'

  return (
    <>
      <Heading id="auth-title">{titles[mode]}</Heading>
      {!auth.ready && <p className="auth-config" role="status">Conectando ao serviço de acesso…</p>}
      {auth.ready && !available && <div className="auth-config" role="alert">
        <p>{auth.error || 'O login está indisponível. A URL ou a chave pública do Supabase está ausente na configuração do FutTable.'}</p>
        <button className="auth-link" type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
      </div>}
      {form && <form onSubmit={submit}>
        {mode === 'forgot' && <p className="auth-copy">Informe o e-mail da sua conta para receber um link de recuperação.</p>}
        {mode !== 'update' && <label>E-mail
          <input type="email" name="email" required autoComplete="email" value={email} maxLength={254}
            onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" />
        </label>}
        {mode !== 'forgot' && <PasswordField key={mode} label={mode === 'update' ? 'Nova senha' : 'Senha'}
            name="password" autoComplete={newPassword ? 'new-password' : 'current-password'}
            minLength={newPassword ? 8 : undefined} placeholder={newPassword ? 'Pelo menos 8 caracteres' : ''}
            value={password} onChange={event => setPassword(event.target.value)} />}
        {newPassword && <PasswordField key={mode + '-confirmation'} label="Confirme a senha"
            description="confirmação da senha" name="confirmation" autoComplete="new-password" value={confirmation}
            onChange={event => setConfirmation(event.target.value)} />}
        {mode === 'login' && <button className="auth-link auth-forgot" type="button" onClick={() => changeMode('forgot')} disabled={busy || !available}>Esqueci minha senha</button>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-primary" type="submit" disabled={busy || !available}>{busy ? 'Aguarde…' : submitLabel}{!modal && <ArrowRight size={17} aria-hidden="true" />}</button>
      </form>}
      {available && mode === 'account' && <div className="auth-actions">
        <p className="auth-copy">{auth.session?.user?.email}</p>
        <button className="auth-primary" type="button" disabled={busy} onClick={() => changeMode('update')}>Alterar senha</button>
        <button className="auth-secondary" type="button" disabled={busy} onClick={() => run(async () => {
          await auth.signOut()
          if (active.current) onDone()
        })}>{busy ? 'Saindo…' : 'Sair da conta'}</button>
      </div>}
      {mode === 'confirm' && <p className="auth-copy">Abra a mensagem enviada para <strong>{email.trim()}</strong> e clique no link para confirmar sua conta.</p>}
      {mode === 'sent' && <p className="auth-copy">Se houver uma conta com o endereço <strong>{email.trim()}</strong>, você receberá um link para cadastrar uma nova senha.</p>}
      {!form && error && <p className="auth-error" role="alert">{error}</p>}
      {notice && <p className="auth-copy" role="status">{notice}</p>}
      {mode === 'confirm' && <button className="auth-secondary" type="button" disabled={busy} onClick={() => run(async () => {
        const { error } = await auth.client.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: returnUrl() } })
        if (error) throw error
        if (active.current) setNotice('Solicitação de reenvio recebida. Confira também o spam.')
      })}>Reenviar e-mail</button>}
      {['confirm', 'sent'].includes(mode) && <button type="button" className="auth-secondary" onClick={() => changeMode('login')}>Voltar para o login</button>}
      {mode === 'link' && <button type="button" className="auth-primary" onClick={onDone}>{auth.session ? 'Continuar' : 'Voltar para o login'}</button>}
      {available && mode === 'login' && <p className="auth-switch">Primeira vez aqui? <button className="auth-link" type="button" onClick={() => changeMode('signup')} disabled={busy}>Criar conta</button></p>}
      {available && ['signup', 'forgot'].includes(mode) && <button className="auth-link auth-back" type="button" onClick={() => changeMode('login')} disabled={busy}>Voltar para o login</button>}
    </>
  )
}
